/**
 * Competitor finder — discovers similar creators on the same platform.
 *
 * YouTube   → extract top keywords from video TITLES (not bio), search channels
 * TikTok    → extract hashtags from video captions, search by hashtag, filter bots
 * Instagram → Piloterr related/search endpoints
 * Twitter   → RapidAPI people search by keywords
 */

import type { Platform, PostData } from './types';

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

// ── Keyword extraction from posts ─────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','is','how','to','for','my','in','of','and','or','this','that',
  'what','why','when','where','who','your','you','i','me','we','us','it','do',
  'does','did','be','been','am','are','was','were','will','would','can','could',
  'should','have','has','had','not','no','with','from','at','by','on','up','out',
  'as','into','through','about','over','after','s','t','re','ve','ll','d','m',
  'im','ive','its','its','heres','just','get','got','here','now','new','all',
  'one','two','three','so','if','but','than','then','them','they','their',
  'his','her','he','she','these','those','use','using','make','made','like',
  'more','most','best','good','great','amazing','free','full','every','day',
  'part','time','first','last','next','back','look','really','still','even',
  'also','only','well','very','way','things','thing','want','need','know',
  'video','videos','watch','channel','follow','subscribe','link','bio','check',
]);

/**
 * Extract the best search keywords from a list of video/post titles.
 * Returns the top N words by frequency, excluding stop words and short tokens.
 */
export function keywordsFromTitles(titles: string[], topN = 4): string {
  const freq: Record<string, number> = {};

  for (const title of titles) {
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));

    for (const w of words) {
      freq[w] = (freq[w] ?? 0) + 1;
    }
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w)
    .join(' ');
}

/**
 * Extract the most-used hashtags from post titles/captions.
 * Returns top N hashtags as space-separated strings (without #).
 */
export function hashtagsFromPosts(posts: PostData[], topN = 4): string {
  const freq: Record<string, number> = {};

  for (const post of posts) {
    const tags = post.title.match(/#([a-zA-Z][a-zA-Z0-9_]{1,30})/g) ?? [];
    for (const tag of tags) {
      const clean = tag.slice(1).toLowerCase();
      if (!STOP_WORDS.has(clean)) {
        freq[clean] = (freq[clean] ?? 0) + 1;
      }
    }
  }

  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([tag]) => tag);

  return top.join(' ');
}

/**
 * Returns true if the candidate username is too similar to the original
 * (catches variants like originalName_, originalName0, _originalName, etc.)
 */
function isSimilarUsername(original: string, candidate: string): boolean {
  const o = original.toLowerCase().replace(/[^a-z0-9]/g, '');
  const c = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (o === c) return true;
  if (c.includes(o) || o.includes(c)) return true;
  // Levenshtein distance ≤ 2 for short handles → likely a variant
  if (o.length <= 12 && levenshtein(o, c) <= 2) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[a.length][b.length];
}

// ── YouTube ───────────────────────────────────────────────────────────────────

async function findYouTubeCompetitors(
  handle: string,
  posts: PostData[]
): Promise<CompetitorProfile[]> {
  const API_KEY = process.env.YOUTUBE_API_KEY;
  if (!API_KEY) return [];

  // Build query: prefer hashtags from titles, fall back to common title keywords
  const hashtags  = hashtagsFromPosts(posts);
  const titleKeys = keywordsFromTitles(posts.map(p => p.title));
  const query     = (hashtags || titleKeys || handle).slice(0, 100);

  console.log(`[YouTube competitors] query="${query}" (from ${posts.length} videos)`);

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'channel');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '15');
  url.searchParams.set('order', 'relevance');

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();

  const results: CompetitorProfile[] = [];
  for (const item of (data.items ?? [])) {
    const channelId   = item.id?.channelId ?? '';
    const customUrl   = (item.snippet?.customUrl ?? '').replace('@', '');
    const title       = item.snippet?.title ?? '';
    const desc        = item.snippet?.description ?? '';
    const thumb       = item.snippet?.thumbnails?.medium?.url ??
                        item.snippet?.thumbnails?.default?.url ?? '';

    const candidateName = customUrl || channelId;
    if (!candidateName) continue;
    if (isSimilarUsername(handle, candidateName) || isSimilarUsername(handle, title)) continue;

    results.push({
      platform:     'youtube',
      username:     customUrl || channelId,
      display_name: title,
      avatar_url:   thumb,
      bio:          desc.slice(0, 120),
      followers:    0,
      verified:     false,
      profile_url:  channelId
        ? `https://www.youtube.com/channel/${channelId}`
        : `https://www.youtube.com/@${customUrl}`,
    });

    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

// ── TikTok ────────────────────────────────────────────────────────────────────

async function findTikTokCompetitors(
  handle: string,
  posts: PostData[]
): Promise<CompetitorProfile[]> {
  const TOKEN = process.env.ENSEMBLEDATA_TOKEN;
  if (!TOKEN) return [];

  // Build query: hashtags from the creator's own videos are far more relevant than bio
  const hashtags  = hashtagsFromPosts(posts);
  const titleKeys = keywordsFromTitles(posts.map(p => p.title), 3);
  const keyword   = hashtags || titleKeys || handle;

  console.log(`[TikTok competitors] keyword="${keyword}" (from ${posts.length} videos)`);

  const res = await fetch(
    `https://ensembledata.com/apis/tt/user/search?keyword=${encodeURIComponent(keyword)}&cursor=0&token=${TOKEN}`
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
  const seenUsernames = new Set<string>();

  for (const item of users) {
    const user       = item.user_info ?? item.user ?? item;
    const uname      = (user.unique_id ?? user.uniqueId ?? '').toLowerCase();
    const followers  = user.follower_count ?? user.fans ?? 0;

    if (!uname) continue;
    // Skip the original creator and any username variants
    if (isSimilarUsername(handle, uname)) continue;
    // Skip obvious bots / brand-new accounts
    if (followers < 500) continue;
    // Skip duplicates (API sometimes returns same user twice)
    if (seenUsernames.has(uname)) continue;
    seenUsernames.add(uname);

    const bio = (user.signature ?? '').trim();
    // Skip accounts with empty bio AND very low engagement signal
    if (!bio && followers < 2000) continue;

    results.push({
      platform:     'tiktok',
      username:     uname,
      display_name: user.nickname ?? user.display_name ?? uname,
      avatar_url:   user.avatar_thumb?.url_list?.[0] ?? user.avatarThumb ?? '',
      bio:          bio.slice(0, 120),
      followers,
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
  posts: PostData[]
): Promise<CompetitorProfile[]> {
  const PILOTERR_KEY = process.env.PILOTERR_API_KEY;
  if (!PILOTERR_KEY) return [];

  // Try Piloterr's related users endpoint first
  const res = await fetch(
    `https://api.piloterr.com/api/v2/instagram/user/related?query=${encodeURIComponent(handle)}`,
    { headers: { 'x-api-key': PILOTERR_KEY } }
  ).catch(() => null);

  let users: any[] = [];

  if (res?.ok) {
    const data = await res.json().catch(() => ({}));
    users = data.data?.users ?? data.users ?? data.data ?? [];
  }

  // Fallback: search by content hashtags
  if (users.length === 0) {
    const kw = hashtagsFromPosts(posts, 2) || keywordsFromTitles(posts.map(p => p.title), 2);
    const searchRes = await fetch(
      `https://api.piloterr.com/api/v2/instagram/user/search?query=${encodeURIComponent(kw || handle)}`,
      { headers: { 'x-api-key': PILOTERR_KEY } }
    ).catch(() => null);

    if (searchRes?.ok) {
      const searchData = await searchRes.json().catch(() => ({}));
      users = searchData.data?.users ?? searchData.users ?? searchData.data ?? [];
    }
  }

  const results: CompetitorProfile[] = [];
  for (const u of users) {
    const uname = (u.username ?? '').toLowerCase();
    if (!uname || isSimilarUsername(handle, uname)) continue;

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
  posts: PostData[]
): Promise<CompetitorProfile[]> {
  const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.TWITTER_RAPIDAPI_HOST ?? 'twitter135.p.rapidapi.com';

  if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'your-rapidapi-key-here') return [];

  const hashtags  = hashtagsFromPosts(posts, 3);
  const titleKeys = keywordsFromTitles(posts.map(p => p.title), 3);
  const query     = hashtags || titleKeys || handle;

  const url = `https://${RAPIDAPI_HOST}/v2/SearchTimeline?query=${encodeURIComponent(query)}&type=People&count=12`;

  const res = await fetch(url, {
    headers: {
      'x-rapidapi-key':  RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  }).catch(() => null);

  if (!res?.ok) return [];
  const data = await res.json().catch(() => ({}));

  const users: any[] =
    data.users ??
    data.data?.users ??
    data.data?.user_results ??
    [];

  const results: CompetitorProfile[] = [];
  for (const item of users) {
    const u     = item.legacy ?? item.user ?? item;
    const uname = (u.screen_name ?? '').toLowerCase();
    if (!uname || isSimilarUsername(handle, uname)) continue;

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
  posts: PostData[],
): Promise<CompetitorProfile[]> {
  try {
    switch (platform) {
      case 'youtube':   return await findYouTubeCompetitors(handle, posts);
      case 'tiktok':    return await findTikTokCompetitors(handle, posts);
      case 'instagram': return await findInstagramCompetitors(handle, posts);
      case 'twitter':   return await findTwitterCompetitors(handle, posts);
      default:          return [];
    }
  } catch (err) {
    console.error(`[competitors] ${platform}/${handle}:`, (err as Error).message);
    return [];
  }
}

/**
 * Legacy helper kept for the route — extracts a plain keyword string from
 * profile bio (used as a fallback label in the UI, not for search).
 */
export function extractKeywords(
  displayName: string,
  bio: string,
  handle: string
): string {
  const cleanBio = bio
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@\w+/g, '')
    .replace(/#\w+/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanBio.length > 8) return cleanBio.slice(0, 80);
  if (displayName.length > 2) return displayName;
  return handle;
}
