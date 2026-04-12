/**
 * Data sync orchestrator
 *
 * Fetches fresh data from each connected platform and writes it to Supabase.
 * Skips platforms that were synced within the last 24 hours unless forced.
 */

import {
  getConnection,
  getAllConnections,
  updateLastSynced,
  upsertConnection,
  upsertDailyMetric,
  upsertPost,
  upsertAudienceDemographic,
  upsertPostingTimeStat,
  getRecentMetricsForEngagement,
} from './db';
import * as ig from './instagram';
import * as tt from './tiktok';
import * as yt from './youtube';

const SYNC_INTERVAL_SECONDS = 24 * 60 * 60;

export async function needsSync(platform: string): Promise<boolean> {
  const conn = await getConnection(platform);
  if (!conn) return false;
  if (!conn.last_synced_at) return true;
  return Date.now() / 1000 - conn.last_synced_at > SYNC_INTERVAL_SECONDS;
}

export async function syncAll(force = false): Promise<Record<string, string>> {
  const connections = await getAllConnections();
  const results: Record<string, string> = {};

  await Promise.allSettled(
    connections.map(async (conn) => {
      if (!force && !(await needsSync(conn.platform))) {
        results[conn.platform] = 'skipped (recently synced)';
        return;
      }
      try {
        await syncPlatform(conn.platform);
        results[conn.platform] = 'ok';
      } catch (err) {
        results[conn.platform] = `error: ${(err as Error).message}`;
      }
    })
  );

  return results;
}

export async function syncPlatform(platform: string): Promise<void> {
  switch (platform) {
    case 'instagram': return syncInstagram();
    case 'tiktok':    return syncTikTok();
    case 'youtube':   return syncYouTube();
    default: throw new Error(`Unknown platform: ${platform}`);
  }
}

// ── Instagram ─────────────────────────────────────────────────────────────────

async function syncInstagram(): Promise<void> {
  const conn = await getConnection('instagram');
  if (!conn) return;

  let accessToken = conn.access_token;

  // Refresh long-lived token if it expires within 7 days
  if (conn.token_expires_at && conn.token_expires_at - Date.now() / 1000 < 7 * 86400) {
    try {
      const refreshed = await ig.refreshLongLivedToken(accessToken);
      accessToken = refreshed.access_token;
      await upsertConnection({
        platform: 'instagram',
        access_token: accessToken,
        token_expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      });
    } catch {
      // continue with existing token
    }
  }

  const igId = conn.user_id;
  if (!igId) return;

  const today = new Date().toISOString().split('T')[0];

  // ── Follower count ──────────────────────────────────────────────────────────
  const followers = await ig.fetchFollowerCount(igId, accessToken);
  await upsertDailyMetric({ platform: 'instagram', date: today, followers });

  // ── Reach + Impressions ─────────────────────────────────────────────────────
  const insights = await ig.fetchInsights(igId, accessToken, 30);
  const byDate: Record<string, Record<string, number>> = {};
  for (const { date, metric, value } of insights) {
    byDate[date] ??= {};
    byDate[date][metric] = value;
  }
  for (const [date, vals] of Object.entries(byDate)) {
    await upsertDailyMetric({
      platform: 'instagram',
      date,
      reach: vals.reach,
      impressions: vals.impressions,
    });
  }

  // ── Posts ───────────────────────────────────────────────────────────────────
  const media = await ig.fetchMedia(igId, accessToken);
  for (const item of media) {
    const totalEngagement = item.like_count + (item.comments_count ?? 0) + (item.saved ?? 0);
    const reach = item.reach ?? 1;
    const engRate = reach > 0 ? (totalEngagement / reach) * 100 : 0;

    await upsertPost({
      platform: 'instagram',
      post_id: item.id,
      caption: item.caption ?? null,
      thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
      post_url: item.permalink,
      media_type: item.media_type,
      published_at: Math.floor(new Date(item.timestamp).getTime() / 1000),
      likes: item.like_count,
      comments: item.comments_count ?? 0,
      shares: 0,
      views: 0,
      reach: item.reach ?? 0,
      impressions: item.impressions ?? 0,
      engagement_rate: engRate,
      watch_time_minutes: 0,
      saves: item.saved ?? 0,
      title: null,
    });

    const d = new Date(item.timestamp);
    await upsertPostingTimeStat({
      platform: 'instagram',
      day_of_week: d.getDay(),
      hour_of_day: d.getHours(),
      engagement: engRate,
    });

    const postDate = item.timestamp.split('T')[0];
    await upsertDailyMetric({
      platform: 'instagram',
      date: postDate,
      likes: item.like_count,
      comments: item.comments_count ?? 0,
      saves: item.saved ?? 0,
    });
  }

  // Recalculate engagement rate for recent days
  const recentMetrics = await getRecentMetricsForEngagement('instagram', 30);
  for (const m of recentMetrics) {
    const eng = m.reach > 0 ? ((m.likes + m.comments + m.saves) / m.reach) * 100 : 0;
    await upsertDailyMetric({ platform: 'instagram', date: m.date, engagement_rate: eng });
  }

  // ── Audience ────────────────────────────────────────────────────────────────
  const { ageGender } = await ig.fetchAudienceDemographics(igId, accessToken);
  const total = Object.values(ageGender).reduce((a, b) => a + b, 0);
  for (const [key, count] of Object.entries(ageGender)) {
    const [gender, ageGroup] = key.split('.');
    if (!gender || !ageGroup) continue;
    await upsertAudienceDemographic({
      platform: 'instagram',
      date: today,
      dimension: 'age_gender',
      label: `${gender}.${ageGroup}`,
      value: total > 0 ? (count / total) * 100 : 0,
    });
  }

  await updateLastSynced('instagram');
}

// ── TikTok ────────────────────────────────────────────────────────────────────

async function syncTikTok(): Promise<void> {
  const conn = await getConnection('tiktok');
  if (!conn) return;

  let accessToken = conn.access_token;

  if (conn.token_expires_at && conn.token_expires_at < Date.now() / 1000 + 300) {
    if (!conn.refresh_token) throw new Error('TikTok refresh token missing');
    const refreshed = await tt.refreshAccessToken(conn.refresh_token);
    accessToken = refreshed.access_token;
    await upsertConnection({
      platform: 'tiktok',
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
    });
  }

  const today = new Date().toISOString().split('T')[0];

  const user = await tt.getUserInfo(accessToken);
  await upsertDailyMetric({
    platform: 'tiktok',
    date: today,
    followers: user.follower_count,
  });

  const videos = await tt.getVideoList(accessToken);
  for (const video of videos) {
    const totalEng = video.like_count + video.comment_count + video.share_count;
    const engRate = video.view_count > 0 ? (totalEng / video.view_count) * 100 : 0;

    await upsertPost({
      platform: 'tiktok',
      post_id: video.id,
      title: video.title || null,
      caption: null,
      thumbnail_url: video.cover_image_url || null,
      post_url: video.share_url || null,
      media_type: 'VIDEO',
      published_at: video.create_time,
      likes: video.like_count,
      comments: video.comment_count,
      shares: video.share_count,
      views: video.view_count,
      reach: 0,
      impressions: 0,
      engagement_rate: engRate,
      watch_time_minutes: Math.floor((video.view_count * video.duration) / 60),
      saves: 0,
    });

    const d = new Date(video.create_time * 1000);
    const postDate = d.toISOString().split('T')[0];

    await upsertPostingTimeStat({
      platform: 'tiktok',
      day_of_week: d.getDay(),
      hour_of_day: d.getHours(),
      engagement: engRate,
    });

    await upsertDailyMetric({
      platform: 'tiktok',
      date: postDate,
      likes: video.like_count,
      comments: video.comment_count,
      shares: video.share_count,
      views: video.view_count,
    });
  }

  await updateLastSynced('tiktok');
}

// ── YouTube ───────────────────────────────────────────────────────────────────

async function syncYouTube(): Promise<void> {
  const conn = await getConnection('youtube');
  if (!conn) return;

  let accessToken = conn.access_token;

  if (conn.token_expires_at && conn.token_expires_at < Date.now() / 1000 + 300) {
    if (!conn.refresh_token) throw new Error('YouTube refresh token missing');
    const refreshed = await yt.refreshAccessToken(conn.refresh_token);
    accessToken = refreshed.access_token;
    await upsertConnection({
      platform: 'youtube',
      access_token: refreshed.access_token,
      token_expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const channelId = conn.user_id;
  if (!channelId) return;

  const channel = await yt.getChannelInfo(accessToken);
  if (channel) {
    await upsertDailyMetric({
      platform: 'youtube',
      date: today,
      followers: channel.subscriber_count,
      views: channel.view_count,
    });
  }

  const analytics = await yt.getDailyAnalytics(channelId, accessToken, 30);
  for (const day of analytics) {
    const engTotal = day.likes + day.comments + day.shares;
    const engRate = day.views > 0 ? (engTotal / day.views) * 100 : 0;

    await upsertDailyMetric({
      platform: 'youtube',
      date: day.date,
      views: day.views,
      watch_time_minutes: day.estimatedMinutesWatched,
      likes: day.likes,
      comments: day.comments,
      shares: day.shares,
      engagement_rate: engRate,
    });
  }

  const videos = await yt.getChannelVideos(channelId, accessToken, 50);
  for (const video of videos) {
    const totalEng = video.like_count + video.comment_count;
    const engRate = video.view_count > 0 ? (totalEng / video.view_count) * 100 : 0;

    await upsertPost({
      platform: 'youtube',
      post_id: video.id,
      title: video.title,
      caption: null,
      thumbnail_url: video.thumbnail_url,
      post_url: `https://youtube.com/watch?v=${video.id}`,
      media_type: 'VIDEO',
      published_at: Math.floor(new Date(video.published_at).getTime() / 1000),
      likes: video.like_count,
      comments: video.comment_count,
      shares: 0,
      views: video.view_count,
      reach: 0,
      impressions: 0,
      engagement_rate: engRate,
      watch_time_minutes: 0,
      saves: 0,
    });

    const d = new Date(video.published_at);
    await upsertPostingTimeStat({
      platform: 'youtube',
      day_of_week: d.getDay(),
      hour_of_day: d.getHours(),
      engagement: engRate,
    });
  }

  const { ageGender } = await yt.getAudienceDemographics(channelId, accessToken);
  for (const { ageGroup, gender, viewerPercentage } of ageGender) {
    await upsertAudienceDemographic({
      platform: 'youtube',
      date: today,
      dimension: 'age_gender',
      label: `${gender}.${ageGroup}`,
      value: viewerPercentage,
    });
  }

  await updateLastSynced('youtube');
}
