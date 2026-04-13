/**
 * Instagram public data via RapidAPI scraper.
 *
 * Recommended API: "Instagram Scraper API" on RapidAPI
 * Host: instagram-scraper-api2.p.rapidapi.com
 * Subscribe at: https://rapidapi.com/search/instagram%20scraper
 *
 * The response shapes below match the `instagram-scraper-api2` provider.
 * If you switch providers, update the normalization in mapPost() / mapProfile().
 */

import type { AnalyticsResult, PostData, ContentType } from '../types';
import { calcFrequency, calcContentTypes } from './youtube';

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY!;
const RAPIDAPI_HOST = process.env.INSTAGRAM_RAPIDAPI_HOST ?? 'instagram-scraper-api2.p.rapidapi.com';
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
    throw new Error(`Instagram API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// ── Normalization ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function mediaTypeToContentType(mediaType: number | string): ContentType {
  const mt = Number(mediaType);
  if (mt === 2) return 'video';
  if (mt === 8) return 'carousel';
  if (mt === 1) return 'photo';
  const s = String(mediaType).toLowerCase();
  if (s.includes('reel') || s.includes('clip')) return 'short';
  if (s.includes('video')) return 'video';
  if (s.includes('carousel') || s.includes('sidecar')) return 'carousel';
  return 'photo';
}

function mapPost(item: any): PostData {
  const views    = item.view_count     ?? item.video_view_count   ?? item.play_count ?? 0;
  const likes    = item.like_count     ?? item.likes_count        ?? 0;
  const comments = item.comment_count  ?? item.comments_count     ?? 0;
  const taken    = item.taken_at       ?? item.timestamp          ?? 0;
  const published = typeof taken === 'number'
    ? new Date(taken * 1000).toISOString()
    : String(taken);

  const thumb =
    item.thumbnail_url                                            ??
    item.image_versions2?.candidates?.[0]?.url                   ??
    item.display_url                                              ??
    item.cover_frame_url                                          ??
    '';

  const mediaType = item.media_type ?? (views > 0 ? 2 : 1);
  const ct        = mediaTypeToContentType(mediaType);
  const engRate   = views > 0 ? ((likes + comments) / views) * 100 : 0;

  return {
    id:               String(item.id ?? item.pk ?? Math.random()),
    title:            item.caption?.text?.slice(0, 120) ?? '',
    thumbnail_url:    thumb,
    post_url:         item.permalink ?? `https://www.instagram.com/p/${item.code ?? item.shortcode ?? ''}`,
    published_at:     published,
    views,
    likes,
    comments,
    shares:           item.reshare_count ?? 0,
    duration_seconds: item.video_duration ?? 0,
    content_type:     ct,
    engagement_rate:  engRate,
  };
}

function mapProfile(user: any): AnalyticsResult['profile'] {
  return {
    username:     user.username    ?? '',
    display_name: user.full_name   ?? user.name ?? user.username ?? '',
    avatar_url:   user.profile_pic_url ?? user.hd_profile_pic_url_info?.url ?? '',
    bio:          user.biography   ?? user.bio ?? '',
    followers:    user.edge_followed_by?.count ?? user.follower_count   ?? user.followers_count ?? 0,
    following:    user.edge_follow?.count      ?? user.following_count  ?? 0,
    post_count:   user.edge_owner_to_timeline_media?.count ?? user.media_count ?? 0,
    total_likes:  user.total_igtv_videos?.count ?? 0,
    verified:     user.is_verified ?? false,
    profile_url:  `https://www.instagram.com/${user.username ?? ''}`,
  };
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchInstagram(handle: string): Promise<AnalyticsResult> {
  const enc = encodeURIComponent(handle);

  // Profile
  const profileRes = await rapidGet(`/v1/info?username_or_id_or_url=${enc}`);
  const user = profileRes.data?.user ?? profileRes.data ?? profileRes.user ?? profileRes;
  if (!user?.username) {
    throw new Error(`Instagram profile not found: ${handle}`);
  }

  // Posts (up to 50 recent)
  const postsRes = await rapidGet(`/v1/posts?username_or_id_or_url=${enc}`);
  const rawPosts: any[] =
    postsRes.data?.items                     ??
    postsRes.data?.user?.edge_owner_to_timeline_media?.edges?.map((e: any) => e.node) ??
    postsRes.items                           ??
    [];

  const posts: PostData[] = rawPosts.map(mapPost);
  const sorted = [...posts].sort((a, b) => b.views - a.views);

  const totalViews  = posts.reduce((s, p) => s + p.views, 0);
  const avgViews    = posts.length ? Math.round(totalViews / posts.length) : 0;
  const avgLikes    = posts.length ? Math.round(posts.reduce((s, p) => s + p.likes, 0) / posts.length) : 0;
  const avgComments = posts.length ? Math.round(posts.reduce((s, p) => s + p.comments, 0) / posts.length) : 0;
  const avgEngRate  = posts.length ? posts.reduce((s, p) => s + p.engagement_rate, 0) / posts.length : 0;
  const topTypes    = calcContentTypes(posts);

  return {
    platform: 'instagram',
    handle,
    profile: mapProfile(user),
    summary: {
      avg_views:               avgViews,
      avg_likes:               avgLikes,
      avg_comments:            avgComments,
      avg_engagement_rate:     avgEngRate,
      total_views:             totalViews,
      posting_frequency_per_week: calcFrequency(posts.map(p => p.published_at)),
      best_content_type:       topTypes[0]?.type ?? 'photo',
      top_content_types:       topTypes,
    },
    posts: sorted,
    fetched_at: Math.floor(Date.now() / 1000),
  };
}
