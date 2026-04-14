/**
 * Instagram public data via Piloterr API (primary) + meta-tag scraping (fallback).
 *
 * Primary:  Piloterr REST API — requires PILOTERR_API_KEY env var.
 *           GET https://api.piloterr.com/api/v2/instagram/user/info?query={handle}
 *           Header: x-api-key: <PILOTERR_API_KEY>
 *           Returns profile + ~12 recent posts in standard IG graph shape.
 *
 * Fallback: Parse og: meta tags from the public profile page — extracts
 *           display name, avatar, and follower/following/post counts.
 *           Returns profile-only result with limited_data: true (no posts).
 *           No API key required.
 *
 * Cache TTL: 24 hours (set in db.ts via PLATFORM_TTL).
 */

import type { AnalyticsResult, PostData, ContentType } from '../types';
import { calcFrequency, calcContentTypes } from './youtube';

const PILOTERR_KEY = process.env.PILOTERR_API_KEY ?? '';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Normalization helpers (unchanged from original) ───────────────────────────

function mediaTypeToContentType(node: any): ContentType {
  if (node.__typename === 'GraphSidecar' || node.media_type === 8) return 'carousel';
  if (node.__typename === 'GraphVideo' || node.is_video || node.media_type === 2) {
    const dur = node.video_duration ?? 0;
    return dur > 0 && dur <= 65 ? 'short' : 'video';
  }
  return 'photo';
}

function mapNode(node: any): PostData {
  const views    = node.video_view_count ?? node.view_count ?? 0;
  const likes    =
    node.like_count ??
    node.edge_liked_by?.count ??
    node.edge_media_preview_like?.count ??
    0;
  const comments =
    node.comment_count ??
    node.edge_media_to_comment?.count ??
    node.edge_media_preview_comment?.count ??
    0;
  const taken    = node.taken_at_timestamp ?? node.taken_at ?? 0;
  const ct       = mediaTypeToContentType(node);
  const engBase  = views > 0 ? views : (likes + comments) > 0 ? (likes + comments) * 50 : 1;
  const engRate  = ((likes + comments) / engBase) * 100;

  const thumb =
    node.thumbnail_src ??
    node.display_url ??
    node.image_versions2?.candidates?.[0]?.url ??
    '';

  return {
    id:               String(node.id ?? node.pk ?? Math.random()),
    title:            node.caption?.text?.slice(0, 120) ??
                      node.edge_media_to_caption?.edges?.[0]?.node?.text?.slice(0, 120) ??
                      '',
    thumbnail_url:    thumb,
    post_url:         node.permalink ??
                      `https://www.instagram.com/p/${node.shortcode ?? node.code ?? ''}`,
    published_at:     taken ? new Date(taken * 1000).toISOString() : new Date().toISOString(),
    views,
    likes,
    comments,
    shares:           node.reshare_count ?? 0,
    duration_seconds: node.video_duration ?? 0,
    content_type:     ct,
    engagement_rate:  engRate,
  };
}

function mapProfile(user: any): AnalyticsResult['profile'] {
  return {
    username:     user.username     ?? '',
    display_name: user.full_name    ?? user.name ?? user.username ?? '',
    avatar_url:   user.profile_pic_url_hd ?? user.profile_pic_url ?? '',
    bio:          user.biography    ?? user.bio ?? '',
    followers:    user.edge_followed_by?.count ?? user.follower_count ?? user.followers_count ?? 0,
    following:    user.edge_follow?.count      ?? user.following_count ?? 0,
    post_count:   user.edge_owner_to_timeline_media?.count ?? user.media_count ?? 0,
    total_likes:  0,
    verified:     user.is_verified  ?? false,
    profile_url:  `https://www.instagram.com/${user.username ?? ''}`,
  };
}

// ── Strategy 1: Piloterr API ──────────────────────────────────────────────────

async function fetchViaPiloterr(handle: string): Promise<{ user: any; posts: any[] }> {
  if (!PILOTERR_KEY) throw new Error('PILOTERR_API_KEY not set');

  const url = `https://api.piloterr.com/api/v2/instagram/user/info?query=${encodeURIComponent(handle)}`;
  const res = await fetch(url, {
    headers: {
      'x-api-key': PILOTERR_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Piloterr API key invalid or unauthorized (${res.status})`);
  }
  if (res.status === 404) {
    throw new Error(`Instagram profile not found: @${handle}`);
  }
  if (res.status === 429) {
    throw new Error(`Piloterr rate limit reached (429)`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Piloterr API ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();

  // Piloterr returns { data: { user: {...} } } where user has the standard IG graph shape
  const user =
    json.data?.user ??
    json.user       ??
    json.data       ??
    json;

  if (!user?.username) {
    throw new Error('Piloterr response missing user data');
  }

  // Extract posts from the timeline media edges (same shape as IG graph API)
  const edges: any[] = user.edge_owner_to_timeline_media?.edges ?? [];
  const posts = edges.map((e: any) => e.node ?? e);

  return { user, posts };
}

// ── Strategy 2: Meta-tag fallback ─────────────────────────────────────────────

async function fetchViaMetaTags(handle: string): Promise<AnalyticsResult> {
  const url = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(
      `Instagram profile not found or private (@${handle}). HTTP ${res.status}`
    );
  }

  const html = await res.text();

  // og:title → "Display Name (@username) • Instagram photos and videos"
  const titleMatch  = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
  const imageMatch  = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
  // og:description → "X Followers, Y Following, Z Posts - See Instagram photos..."
  const descMatch   = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/);

  if (!titleMatch && !descMatch) {
    throw new Error(`Instagram profile not found or private (@${handle})`);
  }

  const rawTitle    = titleMatch?.[1] ?? '';
  const display_name = rawTitle.replace(/\s*[(@].*$/, '').trim() || handle;
  const avatar_url   = imageMatch?.[1]?.replace(/&amp;/g, '&') ?? '';

  const desc         = descMatch?.[1] ?? '';
  const followersM   = desc.match(/([\d,KkMm.]+)\s*Followers?/i);
  const followingM   = desc.match(/([\d,KkMm.]+)\s*Following/i);
  const postsM       = desc.match(/([\d,KkMm.]+)\s*Posts?/i);

  function parseNum(raw?: string): number {
    if (!raw) return 0;
    const s = raw.replace(/,/g, '');
    if (/k$/i.test(s)) return Math.round(parseFloat(s) * 1_000);
    if (/m$/i.test(s)) return Math.round(parseFloat(s) * 1_000_000);
    return parseInt(s, 10) || 0;
  }

  const followers  = parseNum(followersM?.[1]);
  const following  = parseNum(followingM?.[1]);
  const post_count = parseNum(postsM?.[1]);

  return {
    platform: 'instagram',
    handle,
    profile: {
      username:     handle,
      display_name,
      avatar_url,
      bio:          '',
      followers,
      following,
      post_count,
      total_likes:  0,
      verified:     false,
      profile_url:  `https://www.instagram.com/${handle}`,
    },
    summary: {
      avg_views:                  0,
      avg_likes:                  0,
      avg_comments:               0,
      avg_engagement_rate:        0,
      total_views:                0,
      posting_frequency_per_week: 0,
      best_content_type:          'photo',
      top_content_types:          [],
    },
    posts:       [],
    fetched_at:  Math.floor(Date.now() / 1000),
    limited_data: true,
  };
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchInstagram(handle: string): Promise<AnalyticsResult> {
  const cleanHandle = handle.replace(/^@/, '').toLowerCase();

  // Primary: Piloterr API
  try {
    const { user, posts: rawPosts } = await fetchViaPiloterr(cleanHandle);
    const posts: PostData[] = rawPosts.map(mapNode);
    const sorted = [...posts].sort((a, b) => b.views - a.views || b.likes - a.likes);

    const totalViews  = posts.reduce((s, p) => s + p.views, 0);
    const avgViews    = posts.length ? Math.round(totalViews / posts.length) : 0;
    const avgLikes    = posts.length ? Math.round(posts.reduce((s, p) => s + p.likes, 0) / posts.length) : 0;
    const avgComments = posts.length ? Math.round(posts.reduce((s, p) => s + p.comments, 0) / posts.length) : 0;
    const avgEngRate  = posts.length ? posts.reduce((s, p) => s + p.engagement_rate, 0) / posts.length : 0;
    const topTypes    = calcContentTypes(posts);

    return {
      platform: 'instagram',
      handle:   cleanHandle,
      profile:  mapProfile(user),
      summary: {
        avg_views:                  avgViews,
        avg_likes:                  avgLikes,
        avg_comments:               avgComments,
        avg_engagement_rate:        avgEngRate,
        total_views:                totalViews,
        posting_frequency_per_week: calcFrequency(posts.map(p => p.published_at)),
        best_content_type:          topTypes[0]?.type ?? 'photo',
        top_content_types:          topTypes,
      },
      posts: sorted,
      fetched_at: Math.floor(Date.now() / 1000),
    };
  } catch (pilotErr) {
    // Rethrow hard 404s — no point trying meta tags for a non-existent profile
    const msg = (pilotErr as Error).message;
    if (msg.includes('not found') && !msg.includes('PILOTERR_API_KEY')) {
      throw pilotErr;
    }
    // Otherwise fall through to meta-tag fallback
    console.warn(`[instagram] Piloterr failed (${msg}), falling back to meta tags`);
  }

  // Fallback: meta-tag scraping (profile-only)
  return fetchViaMetaTags(cleanHandle);
}
