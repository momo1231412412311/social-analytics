/**
 * TikTok public data via EnsembleData API.
 *
 * Sign up (free trial, no card needed) at: https://ensembledata.com/
 * Set your token in ENSEMBLEDATA_TOKEN env var.
 *
 * Endpoints used:
 *   GET https://ensembledata.com/apis/tt/user/info?username={handle}&token={token}
 *   GET https://ensembledata.com/apis/tt/user/posts?username={handle}&depth=3&cursor=0&token={token}
 */

import type { AnalyticsResult, PostData, ContentType } from '../types';
import { calcFrequency, calcContentTypes } from './youtube';

const BASE  = 'https://ensembledata.com/apis';
const TOKEN = process.env.ENSEMBLEDATA_TOKEN ?? '';

async function edGet(path: string) {
  if (!TOKEN) throw new Error('ENSEMBLEDATA_TOKEN is not set. Get a free token at https://ensembledata.com/');
  const res = await fetch(`${BASE}${path}&token=${TOKEN}`);
  if (res.status === 401 || res.status === 403) {
    throw new Error('EnsembleData token invalid or expired. Check ENSEMBLEDATA_TOKEN.');
  }
  if (res.status === 429) throw new Error('EnsembleData rate limit reached. Try again later.');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`EnsembleData TikTok API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function ttContentType(dur: number): ContentType {
  return dur <= 65 ? 'short' : 'video';
}

function mapVideo(item: any): PostData {
  // EnsembleData wraps TikTok's native aweme object; try nested and flat shapes
  const stats   = item.stats ?? item.statistics ?? {};
  const views   = stats.playCount   ?? stats.play_count  ?? item.play_count  ?? 0;
  const likes   = stats.diggCount   ?? stats.digg_count  ?? stats.like_count  ?? item.digg_count  ?? 0;
  const comments= stats.commentCount ?? stats.comment_count ?? item.comment_count ?? 0;
  const shares  = stats.shareCount   ?? stats.share_count  ?? item.share_count   ?? 0;
  const dur     = item.video?.duration ?? item.duration ?? 0;
  const created = item.createTime    ?? item.create_time   ?? 0;
  const thumb   =
    item.video?.cover        ??
    item.video?.originCover  ??
    item.cover               ??
    '';
  const authorHandle = item.author?.uniqueId ?? item.authorId ?? '';
  const engRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

  return {
    id:               String(item.id ?? item.aweme_id ?? Math.random()),
    title:            (item.desc ?? item.title ?? '').slice(0, 120),
    thumbnail_url:    thumb,
    post_url:         item.share_url ??
                      `https://www.tiktok.com/@${authorHandle}/video/${item.id ?? ''}`,
    published_at:     created ? new Date(Number(created) * 1000).toISOString() : new Date().toISOString(),
    views,
    likes,
    comments,
    shares,
    duration_seconds: dur,
    content_type:     ttContentType(dur),
    engagement_rate:  engRate,
  };
}

function mapUser(user: any, stats: any): AnalyticsResult['profile'] {
  return {
    username:     user.uniqueId      ?? user.username     ?? '',
    display_name: user.nickname      ?? user.displayName  ?? user.uniqueId ?? '',
    avatar_url:   user.avatarLarger  ?? user.avatarMedium ?? user.avatar   ?? '',
    bio:          user.signature     ?? user.bio          ?? '',
    followers:    stats.followerCount ?? stats.fans        ?? stats.follower_count ?? 0,
    following:    stats.followingCount ?? stats.following_count ?? 0,
    post_count:   stats.videoCount    ?? stats.video_count   ?? 0,
    total_likes:  stats.heartCount    ?? stats.heart         ?? stats.digg_count   ?? 0,
    verified:     user.verified       ?? false,
    profile_url:  `https://www.tiktok.com/@${user.uniqueId ?? ''}`,
  };
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchTikTok(handle: string): Promise<AnalyticsResult> {
  const enc = encodeURIComponent(handle.replace(/^@/, ''));

  // User info — returns { data: { user: {...}, stats: {...} } }
  const infoRes  = await edGet(`/tt/user/info?username=${enc}`);
  const userObj  =
    infoRes.data?.user    ??
    infoRes.userInfo?.user ??
    infoRes.user          ??
    infoRes.data          ??
    {};
  const statsObj =
    infoRes.data?.stats    ??
    infoRes.userInfo?.stats ??
    infoRes.stats          ??
    {};

  if (!userObj.uniqueId && !userObj.username) {
    throw new Error(`TikTok profile not found: ${handle}`);
  }

  // User posts — depth=3 → ~30 posts (10 per chunk); cursor=0 starts from newest
  const postsRes  = await edGet(`/tt/user/posts?username=${enc}&depth=3&cursor=0`);
  // EnsembleData returns { data: [...], cursor, has_more } — data IS the array.
  // Guard with Array.isArray first; keep the nested-path fallbacks for any shape change.
  const rawVideos: any[] =
    (Array.isArray(postsRes.data) ? postsRes.data : null) ??
    postsRes.data?.data    ??
    postsRes.data?.videos  ??
    postsRes.data?.aweme_list ??
    postsRes.videos        ??
    postsRes.aweme_list    ??
    [];

  const posts: PostData[] = rawVideos.map(mapVideo);
  const sorted = [...posts].sort((a, b) => b.views - a.views);

  const totalViews  = posts.reduce((s, p) => s + p.views, 0);
  const avgViews    = posts.length ? Math.round(totalViews / posts.length) : 0;
  const avgLikes    = posts.length ? Math.round(posts.reduce((s, p) => s + p.likes, 0) / posts.length) : 0;
  const avgComments = posts.length ? Math.round(posts.reduce((s, p) => s + p.comments, 0) / posts.length) : 0;
  const avgEngRate  = posts.length ? posts.reduce((s, p) => s + p.engagement_rate, 0) / posts.length : 0;
  const topTypes    = calcContentTypes(posts);

  return {
    platform: 'tiktok',
    handle:   handle.replace(/^@/, ''),
    profile:  mapUser(userObj, statsObj),
    summary: {
      avg_views:                  avgViews,
      avg_likes:                  avgLikes,
      avg_comments:               avgComments,
      avg_engagement_rate:        avgEngRate,
      total_views:                totalViews,
      posting_frequency_per_week: calcFrequency(posts.map(p => p.published_at)),
      best_content_type:          topTypes[0]?.type ?? 'short',
      top_content_types:          topTypes,
    },
    posts: sorted,
    fetched_at: Math.floor(Date.now() / 1000),
  };
}
