/**
 * Competitor finder — discovers similar creators on the same platform.
 *
 * Strategy per platform:
 *   YouTube   → search channels using keywords from the original channel's title/description
 *   TikTok    → EnsembleData keyword user search
 *   Instagram → Piloterr related users endpoint (falls back to keyword search)
 *   Twitter   → RapidAPI Twitter135 user search by keywords
 *
 * Returns up to MAX_RESULTS competitor profiles, excluding the original handle.
 */

import type { Platform } from './types';

export interface CompetitorProfile {
  platform:     Platform;
  username:     string;
  display_name: string;
  avatar_url:   string;
  bio:          string;
  followers:    number;
  verified:     boolean;
  profile_url:  string;
}

const MAX_RESULTS = 6;

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── YouTube ───────────────────────────────────────────────────────────────────

async function findYouTubeCompetitors(
  handle: string,
  keywords: string
): Promise<CompetitorProfile[]> {
  const API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) return [];

  const query = keywords.slice(0, 80);
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'channel');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('order', 'relevance');

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();

  const results: CompetitorProfile[] = [];
  for (const item of (data.items ?? [])) {
    const channelId  = item.id?.channelId;
    const title      = item.snippet?.title ?? '';
    const desc       = item.snippet?.description ?? '';
    const thumb      = item.snippet?.thumbnails?.medium?.url ??
                       item.snippet?.thumbnails?.default?.url ?? '';
    const customUrl  = item.snippet?.customUrl ?? channelId ?? '';

    // Skip the original
    if (
      customUrl.toLowerCase().replace('@', '') === handle.toLowerCase() ||
      title.toLowerCase() === handle.toLowerCase()
    ) continue;

    results.push({
      platform:     'youtube',
      username:     customUrl.replace('@', '') || channelId,
      display_name: title,
      avatar_url:   thumb,
      bio:          desc.slice(0, 120),
      followers:    0, // subscriber count requires a second channels call — omit for speed
      verified:     false,
      profile_url:  channelId
        ? `https://www.youtube.com/channel/${channelId}`
        : `https://www.youtube.com/@${customUrl.replace('@', '')}`,
    });

    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

// ── TikTok ────────────────────────────────────────────────────────────────────

async function findTikTokCompetitors(
  handle: string,
  keywords: string
): Promise<CompetitorProfile[]> {
  const TOKEN = process.env.ENSEMBLEDATA_TOKEN;
  if (!TOKEN) return [];

  const keyword = encodeURIComponent(keywords.split(' ').slice(0, 3).join(' '));
  const res = await fetch(
    `https://ensembledata.com/apis/tt/user/search?keyword=${keyword}&cursor=0&token=${TOKEN}`
  );
  if (!res.ok) return [];
  const data = await res.json();

  const users: any[] =
    data.data?.user_list ??
    data.data?.users ??
    data.user_list ??
    data.users ??
    [];

  const results: CompetitorProfile[] = [];
  for (const item of users) {
    const user  = item.user_info ?? item.user ?? item;
    const uname = (user.unique_id ?? user.uniqueId ?? '').toLowerCase();
    if (!uname || uname === handle.toLowerCase()) continue;

    results.push({
      platform:     'tiktok',
      username:     uname,
      display_name: user.nickname ?? user.display_name ?? uname,
      avatar_url:   user.avatar_thumb?.url_list?.[0] ?? user.avatarThumb ?? '',
      bio:          (user.signature ?? '').slice(0, 120),
      followers:    user.follower_count ?? user.fans ?? 0,
      verified:     user.custom_verify != null || user.verified === true,
      profile_url:  `https://www.tiktok.com/@${uname}`,
    });

    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

// ── Instagram ────────────────────────────────────────────────────────────────

async function findInstagramCompetitors(
  handle: string,
  keywords: string
): Promise<CompetitorProfile[]> {
  const PILOTERR_KEY = process.env.PILOTERR_API_KEY;
  if (!PILOTERR_KEY) return [];

  // Try Piloterr's related/similar users endpoint
  const res = await fetch(
    `https://api.piloterr.com/api/v2/instagram/user/related?query=${encodeURIComponent(handle)}`,
    { headers: { 'x-api-key': PILOTERR_KEY } }
  ).catch(() => null);

  let users: any[] = [];

  if (res?.ok) {
    const data = await res.json().catch(() => ({}));
    users =
      data.data?.users ??
      data.users ??
      data.data ??
      [];
  }

  // Fallback: search by keyword
  if (users.length === 0) {
    const kw = keywords.split(' ').slice(0, 2).join(' ');
    const searchRes = await fetch(
      `https://api.piloterr.com/api/v2/instagram/user/search?query=${encodeURIComponent(kw)}`,
      { headers: { 'x-api-key': PILOTERR_KEY } }
    ).catch(() => null);

    if (searchRes?.ok) {
      const searchData = await searchRes.json().catch(() => ({}));
      users =
        searchData.data?.users ??
        searchData.users ??
        searchData.data ??
        [];
    }
  }

  const results: CompetitorProfile[] = [];
  for (const u of users) {
    const uname = (u.username ?? '').toLowerCase();
    if (!uname || uname === handle.toLowerCase()) continue;

    results.push({
      platform:     'instagram',
      username:     uname,
      display_name: u.full_name ?? u.name ?? uname,
      avatar_url:   u.profile_pic_url ?? u.profile_pic_url_hd ?? '',
      bio:          (u.biography ?? u.bio ?? '').slice(0, 120),
      followers:    u.edge_followed_by?.count ?? u.follower_count ?? u.followers_count ?? 0,
      verified:     u.is_verified ?? false,
      profile_url:  `https://www.instagram.com/${uname}`,
    });

    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

// ── Twitter ───────────────────────────────────────────────────────────────────

async function findTwitterCompetitors(
  handle: string,
  keywords: string
): Promise<CompetitorProfile[]> {
  const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.TWITTER_RAPIDAPI_HOST ?? 'twitter135.p.rapidapi.com';

  if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'your-rapidapi-key-here') return [];

  const query = keywords.split(' ').slice(0, 4).join(' ');
  const url = `https://${RAPIDAPI_HOST}/v2/SearchTimeline?query=${encodeURIComponent(query)}&type=People&count=10`;

  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key':  RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  }).catch(() => null);

  if (!res?.ok) return [];
  const data = await res.json().catch(() => ({}));

  // Twitter search returns users embedded in timeline or as user list
  const users: any[] =
    data.users ??
    data.data?.users ??
    data.data?.user_results ??
    [];

  const results: CompetitorProfile[] = [];
  for (const item of users) {
    const u     = item.legacy ?? item.user ?? item;
    const uname = (u.screen_name ?? '').toLowerCase();
    if (!uname || uname === handle.toLowerCase()) continue;

    results.push({
      platform:     'twitter',
      username:     uname,
      display_name: u.name ?? uname,
      avatar_url:   (u.profile_image_url_https ?? '').replace('_normal', '_200x200'),
      bio:          (u.description ?? '').slice(0, 120),
      followers:    u.followers_count ?? 0,
      verified:     u.verified ?? u.is_blue_verified ?? false,
      profile_url:  `https://x.com/${uname}`,
    });

    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function findCompetitors(
  platform: Platform,
  handle: string,
  keywords: string
): Promise<CompetitorProfile[]> {
  try {
    switch (platform) {
      case 'youtube':   return await findYouTubeCompetitors(handle, keywords);
      case 'tiktok':    return await findTikTokCompetitors(handle, keywords);
      case 'instagram': return await findInstagramCompetitors(handle, keywords);
      case 'twitter':   return await findTwitterCompetitors(handle, keywords);
      default:          return [];
    }
  } catch (err) {
    console.error(`[competitors] ${platform}/${handle}:`, (err as Error).message);
    return [];
  }
}

/**
 * Extract search keywords from an analytics result.
 * Tries bio first, falls back to display_name, then handle.
 */
export function extractKeywords(
  displayName: string,
  bio: string,
  handle: string
): string {
  // Clean bio: strip URLs, @mentions, hashtags, emoji
  const cleanBio = bio
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@\w+/g, '')
    .replace(/#\w+/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanBio.length > 8) return cleanBio.slice(0, 100);
  if (displayName.length > 2) return displayName;
  return handle;
}
