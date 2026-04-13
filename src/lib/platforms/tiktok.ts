/**
 * TikTok public data via RapidAPI scraper.
 *
 * Recommended API: "TikTok Scraper" on RapidAPI
 * Host: tiktok-scraper7.p.rapidapi.com
 * Subscribe at: https://rapidapi.com/search/tiktok%20scraper
 *
 * Same RAPIDAPI_KEY as Instagram. Set TIKTOK_RAPIDAPI_HOST to override host.
 */

import type { AnalyticsResult, PostData, ContentType } from '../types';
import { calcFrequency, calcContentTypes } from './youtube';

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY!;
const RAPIDAPI_HOST = process.env.TIKTOK_RAPIDAPI_HOST ?? 'tiktok-scraper7.p.rapidapi.com';
const BASE          = `https://${RAPIDAPI_HOST}`;

async function rapidGet(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'x-rapidapi-key':  RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TikTok API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function ttContentType(dur: number): ContentType {
  if (dur <= 65) return 'short';
  return 'video';
}

function mapVideo(item: any): PostData {
  const stats   = item.stats ?? item.statistics ?? {};
  const views   = stats.playCount  ?? stats.viewCount  ?? item.playCount  ?? item.viewCount  ?? 0;
  const likes   = stats.diggCount  ?? stats.likeCount  ?? item.diggCount  ?? item.likeCount  ?? 0;
  const comments= stats.commentCount ?? item.commentCount ?? 0;
  const shares  = stats.shareCount  ?? item.shareCount  ?? 0;
  const dur     = item.video?.duration ?? item.duration ?? 0;
  const created = item.createTime   ?? item.create_time ?? 0;
  const thumb   =
    item.video?.cover             ??
    item.video?.originCover       ??
    item.cover                    ??
    '';

  const engRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

  return {
    id:               String(item.id ?? item.awemeId ?? Math.random()),
    title:            item.desc?.slice(0, 120) ?? '',
    thumbnail_url:    thumb,
    post_url:         item.shareUrl ?? `https://www.tiktok.com/@${item.author?.uniqueId ?? 'user'}/video/${item.id ?? ''}`,
    published_at:     created ? new Date(created * 1000).toISOString() : new Date().toISOString(),
    views,
    likes,
    comments,
    shares,
    duration_seconds: dur,
    content_type:     ttContentType(dur),
    engagement_rate:  engRate,
  };
}

function mapUser(user: any, authorStats: any): AnalyticsResult['profile'] {
  const s = authorStats ?? user.stats ?? user.authorStats ?? {};
  return {
    username:     user.uniqueId   ?? user.username      ?? '',
    display_name: user.nickname   ?? user.displayName   ?? user.uniqueId ?? '',
    avatar_url:   user.avatarLarger ?? user.avatarMedium ?? user.avatar ?? '',
    bio:          user.signature  ?? user.bio           ?? '',
    followers:    s.followerCount ?? s.fans             ?? 0,
    following:    s.followingCount ?? 0,
    post_count:   s.videoCount    ?? 0,
    total_likes:  s.heartCount    ?? s.heart            ?? s.diggCount ?? 0,
    verified:     user.verified   ?? false,
    profile_url:  `https://www.tiktok.com/@${user.uniqueId ?? ''}`,
  };
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchTikTok(handle: string): Promise<AnalyticsResult> {
  const enc = encodeURIComponent(handle);

  // User info
  const infoRes = await rapidGet(`/user/info?uniqueId=${enc}`);
  const userObj =
    infoRes.data?.user       ??
    infoRes.userInfo?.user   ??
    infoRes.user             ??
    infoRes.data             ??
    infoRes;
  const statsObj =
    infoRes.data?.stats      ??
    infoRes.userInfo?.stats  ??
    infoRes.stats            ??
    {};

  if (!userObj?.uniqueId && !userObj?.username) {
    throw new Error(`TikTok profile not found: ${handle}`);
  }

  // Videos
  const videosRes = await rapidGet(`/user/posts?uniqueId=${enc}&count=30`);
  const rawVideos: any[] =
    videosRes.data?.videos   ??
    videosRes.data?.aweme_list ??
    videosRes.videos         ??
    videosRes.aweme_list     ??
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
    handle,
    profile: mapUser(userObj, statsObj),
    summary: {
      avg_views:               avgViews,
      avg_likes:               avgLikes,
      avg_comments:            avgComments,
      avg_engagement_rate:     avgEngRate,
      total_views:             totalViews,
      posting_frequency_per_week: calcFrequency(posts.map(p => p.published_at)),
      best_content_type:       topTypes[0]?.type ?? 'short',
      top_content_types:       topTypes,
    },
    posts: sorted,
    fetched_at: Math.floor(Date.now() / 1000),
  };
}
