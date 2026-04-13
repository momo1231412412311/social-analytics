/**
 * YouTube Data API v3 — public data, API key only (no OAuth).
 *
 * Docs: https://developers.google.com/youtube/v3/docs
 */

import type { AnalyticsResult, PostData, ContentType } from '../types';

const API_KEY = process.env.YOUTUBE_API_KEY!;
const BASE = 'https://www.googleapis.com/youtube/v3';

type YTResolution = 'id' | 'forHandle' | 'forUsername' | 'search';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function ytGet(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('key', API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Channel resolution ────────────────────────────────────────────────────────

interface YTChannel {
  id: string;
  snippet: { title: string; description: string; thumbnails: { default?: { url: string }; medium?: { url: string } }; customUrl?: string };
  statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
}

async function resolveChannel(handle: string, hint: YTResolution = 'forHandle'): Promise<YTChannel> {
  const part = 'snippet,statistics';

  const attempts: Array<() => Promise<YTChannel | null>> = [];

  if (hint === 'id') {
    attempts.push(async () => {
      const d = await ytGet('/channels', { part, id: handle });
      return d.items?.[0] ?? null;
    });
  }

  if (hint === 'forHandle' || hint === 'search') {
    const h = handle.startsWith('@') ? handle : `@${handle}`;
    attempts.push(async () => {
      const d = await ytGet('/channels', { part, forHandle: h });
      return d.items?.[0] ?? null;
    });
  }

  if (hint === 'forUsername' || hint === 'search') {
    attempts.push(async () => {
      const d = await ytGet('/channels', { part, forUsername: handle });
      return d.items?.[0] ?? null;
    });
  }

  // Final fallback: search
  attempts.push(async () => {
    const s = await ytGet('/search', { part: 'snippet', q: handle, type: 'channel', maxResults: '1' });
    const channelId = s.items?.[0]?.id?.channelId;
    if (!channelId) return null;
    const d = await ytGet('/channels', { part, id: channelId });
    return d.items?.[0] ?? null;
  });

  for (const attempt of attempts) {
    try {
      const ch = await attempt();
      if (ch) return ch;
    } catch { /* try next */ }
  }

  throw new Error(`YouTube channel not found: ${handle}`);
}

// ── ISO 8601 duration → seconds ───────────────────────────────────────────────

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0') * 3600) + (parseInt(m[2] ?? '0') * 60) + parseInt(m[3] ?? '0');
}

function contentTypeFromDuration(secs: number): ContentType {
  if (secs === 0) return 'unknown';
  if (secs <= 65) return 'short';    // YouTube Shorts threshold
  return 'video';
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchYouTube(
  handle: string,
  hint: YTResolution = 'forHandle'
): Promise<AnalyticsResult> {
  const channel = await resolveChannel(handle, hint);
  const channelId = channel.id;

  // Get up to 50 recent video IDs
  const searchData = await ytGet('/search', {
    part: 'id',
    channelId,
    type: 'video',
    order: 'date',
    maxResults: '50',
  });
  const videoIds: string[] = (searchData.items ?? [])
    .map((i: { id: { videoId?: string } }) => i.id?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) {
    throw new Error('No public videos found for this channel.');
  }

  // Get video details in one batch call
  const videosData = await ytGet('/videos', {
    part: 'snippet,statistics,contentDetails',
    id: videoIds.join(','),
  });

  type RawVideo = {
    id: string;
    snippet: { title: string; publishedAt: string; thumbnails: { medium?: { url: string }; high?: { url: string } } };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string; favoriteCount?: string };
    contentDetails: { duration: string };
  };

  const posts: PostData[] = (videosData.items ?? []).map((v: RawVideo): PostData => {
    const views    = parseInt(v.statistics.viewCount   ?? '0', 10);
    const likes    = parseInt(v.statistics.likeCount   ?? '0', 10);
    const comments = parseInt(v.statistics.commentCount ?? '0', 10);
    const dur      = parseDuration(v.contentDetails.duration);
    const engRate  = views > 0 ? ((likes + comments) / views) * 100 : 0;

    return {
      id:               v.id,
      title:            v.snippet.title,
      thumbnail_url:    v.snippet.thumbnails.medium?.url ?? v.snippet.thumbnails.high?.url ?? '',
      post_url:         `https://www.youtube.com/watch?v=${v.id}`,
      published_at:     v.snippet.publishedAt,
      views,
      likes,
      comments,
      shares:           0,
      duration_seconds: dur,
      content_type:     contentTypeFromDuration(dur),
      engagement_rate:  engRate,
    };
  });

  // Sort by views desc for top posts
  const sorted = [...posts].sort((a, b) => b.views - a.views);

  const stats = channel.statistics;
  const followers    = parseInt(stats.subscriberCount ?? '0', 10);
  const totalViews   = posts.reduce((s, p) => s + p.views, 0);
  const avgViews     = posts.length ? Math.round(totalViews / posts.length) : 0;
  const avgLikes     = posts.length ? Math.round(posts.reduce((s, p) => s + p.likes, 0) / posts.length) : 0;
  const avgComments  = posts.length ? Math.round(posts.reduce((s, p) => s + p.comments, 0) / posts.length) : 0;
  const avgEngRate   = posts.length ? posts.reduce((s, p) => s + p.engagement_rate, 0) / posts.length : 0;
  const postingFreq  = calcFrequency(posts.map(p => p.published_at));
  const topTypes     = calcContentTypes(posts);

  return {
    platform: 'youtube',
    handle,
    profile: {
      username:     channel.snippet.customUrl?.replace('@', '') ?? handle,
      display_name: channel.snippet.title,
      avatar_url:   channel.snippet.thumbnails.medium?.url ?? channel.snippet.thumbnails.default?.url ?? '',
      bio:          channel.snippet.description.slice(0, 300),
      followers,
      following:    0,
      post_count:   parseInt(stats.videoCount ?? '0', 10),
      total_likes:  0,
      verified:     false,
      profile_url:  `https://www.youtube.com/channel/${channelId}`,
    },
    summary: {
      avg_views:               avgViews,
      avg_likes:               avgLikes,
      avg_comments:            avgComments,
      avg_engagement_rate:     avgEngRate,
      total_views:             totalViews,
      posting_frequency_per_week: postingFreq,
      best_content_type:       topTypes[0]?.type ?? 'video',
      top_content_types:       topTypes,
    },
    posts: sorted,
    fetched_at: Math.floor(Date.now() / 1000),
  };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function calcFrequency(dates: string[]): number {
  if (dates.length < 2) return 0;
  const sorted = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const spanMs = sorted[sorted.length - 1] - sorted[0];
  const weeks  = spanMs / (7 * 86400 * 1000);
  return weeks > 0 ? Math.round((dates.length / weeks) * 10) / 10 : 0;
}

export function calcContentTypes(
  posts: PostData[]
): Array<{ type: ContentType; avg_views: number; count: number }> {
  const map = new Map<ContentType, { total: number; count: number }>();
  for (const p of posts) {
    const existing = map.get(p.content_type) ?? { total: 0, count: 0 };
    map.set(p.content_type, { total: existing.total + p.views, count: existing.count + 1 });
  }
  return Array.from(map.entries())
    .map(([type, { total, count }]) => ({ type, avg_views: Math.round(total / count), count }))
    .sort((a, b) => b.avg_views - a.avg_views);
}
