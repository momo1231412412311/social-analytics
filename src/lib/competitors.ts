/**
 * Competitor finder — audience-overlap approach.
 *
 * YouTube   → fetch video TAGS from the creator's top videos (creator-set metadata),
 *             then search for channels targeting those exact same tags.
 *             Much more precise than title keywords or bio text.
 *
 * TikTok    → fetch the top videos from each hashtag the creator uses,
 *             find which OTHER creators appear most frequently in those hashtags.
 *             This is the "viewers also watch" signal — same hashtag ecosystem = same audience.
 *
 * Instagram → Piloterr related users endpoint (audience graph)
 * Twitter   → keyword search by content topics
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

// ── Shared utilities ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','is','how','to','for','my','in','of','and','or','this','that',
  'what','why','when','where','who','your','you','i','me','we','us','it','do',
  'does','did','be','been','am','are','was','were','will','would','can','could',
  'should','have','has','had','not','no','with','from','at','by','on','up','out',
  'as','into','through','about','over','after','s','t','re','ve','ll','d','m',
  'im','ive','its','heres','just','get','got','here','now','new','all','one',
  'two','three','so','if','but','than','then','them','they','their','his','her',
  'he','she','these','those','use','using','make','made','like','more','most',
  'best','good','great','amazing','free','full','every','day','part','time',
  'first','last','next','back','look','really','still','even','also','only',
  'well','very','way','things','thing','want','need','know','video','videos',
  'watch','channel','follow','subscribe','link','bio','check','trading','trader',
]);

export function hashtagsFromPosts(posts: PostData[], topN = 4): string {
  const freq: Record<string, number> = {};
  for (const post of posts) {
    for (const tag of (post.title.match(/#([a-zA-Z][a-zA-Z0-9_]{1,30})/g) ?? [])) {
      const clean = tag.slice(1).toLowerCase();
      if (!STOP_WORDS.has(clean)) freq[clean] = (freq[clean] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([t]) => t)
    .join(' ');
}

export function keywordsFromTitles(titles: string[], topN = 4): string {
  const freq: Record<string, number> = {};
  for (const title of titles) {
    for (const w of title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
      if (w.length > 3 && !STOP_WORDS.has(w)) freq[w] = (freq[w] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([w]) => w)
    .join(' ');
}

function isSimilarUsername(original: string, candidate: string): boolean {
  const o = original.toLowerCase().replace(/[^a-z0-9]/g, '');
  const c = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!c) return true;
  if (o === c) return true;
  if (c.includes(o) || o.includes(c)) return true;
  if (o.length <= 12 && levenshtein(o, c) <= 2) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

// ── YouTube — video-tag based search ─────────────────────────────────────────

async function ytGet(path: string, params: Record<string, string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3${path}`);
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  return res.json();
}

async function findYouTubeCompetitors(
  handle: string,
  posts: PostData[]
): Promise<{ competitors: CompetitorProfile[]; searchLabel: string }> {
  if (!process.env.YOUTUBE_API_KEY) return { competitors: [], searchLabel: '' };

  // Step 1: get video tags from the creator's top 5 videos
  const topVideoIds = posts
    .slice(0, 5)
    .map(p => p.id)
    .filter(Boolean)
    .join(',');

  let tags: string[] = [];

  if (topVideoIds) {
    try {
      const videoData = await ytGet('/videos', {
        part:       'snippet',
        id:         topVideoIds,
        maxResults: '5',
      });
      const tagFreq: Record<string, number> = {};
      for (const item of (videoData.items ?? [])) {
        for (const tag of (item.snippet?.tags ?? [])) {
          const t = (tag as string).toLowerCase().trim();
          if (t.length > 2 && !STOP_WORDS.has(t)) {
            tagFreq[t] = (tagFreq[t] ?? 0) + 1;
          }
        }
      }
      tags = Object.entries(tagFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([t]) => t);
    } catch {
      // fall through to title keywords
    }
  }

  // Step 2: if no tags found, fall back to hashtags then title keywords
  const hashtags  = hashtagsFromPosts(posts);
  const titleKeys = keywordsFromTitles(posts.map(p => p.title));
  const query = tags.length > 0
    ? tags.slice(0, 4).join(' ')
    : hashtags || titleKeys || handle;

  const searchLabel = tags.length > 0
    ? `video tags: ${tags.slice(0, 3).map(t => `"${t}"`).join(', ')}`
    : hashtags
      ? hashtags.split(' ').map(t => `#${t}`).join(' ')
      : titleKeys;

  console.log(`[YouTube competitors] query="${query}" tags=${tags.length}`);

  // Step 3: search for channels using those tags
  const searchData = await ytGet('/search', {
    part:       'snippet',
    type:       'channel',
    q:          query.slice(0, 100),
    maxResults: '15',
    order:      'relevance',
  });

  const competitors: CompetitorProfile[] = [];
  for (const item of (searchData.items ?? [])) {
    const channelId  = item.id?.channelId ?? '';
    const customUrl  = (item.snippet?.customUrl ?? '').replace('@', '');
    const title      = item.snippet?.title ?? '';
    const desc       = item.snippet?.description ?? '';
    const thumb      = item.snippet?.thumbnails?.medium?.url ??
                       item.snippet?.thumbnails?.default?.url ?? '';

    if (!channelId) continue;
    if (isSimilarUsername(handle, customUrl) || isSimilarUsername(handle, title)) continue;

    competitors.push({
      platform:     'youtube',
      username:     customUrl || channelId,
      display_name: title,
      avatar_url:   thumb,
      bio:          desc.slice(0, 120),
      followers:    0,
      verified:     false,
      profile_url:  `https://www.youtube.com/channel/${channelId}`,
    });
    if (competitors.length >= MAX_RESULTS) break;
  }

  return { competitors, searchLabel };
}

// ── TikTok — hashtag-ecosystem overlap ───────────────────────────────────────

async function findTikTokCompetitors(
  handle: string,
  posts: PostData[]
): Promise<{ competitors: CompetitorProfile[]; searchLabel: string }> {
  const TOKEN = process.env.ENSEMBLEDATA_TOKEN;
  if (!TOKEN) return { competitors: [], searchLabel: '' };

  // Extract top hashtags from the creator's own videos
  const hashtagStr = hashtagsFromPosts(posts, 5);
  const topHashtags = hashtagStr ? hashtagStr.split(' ') : [];

  let searchLabel = '';
  const creatorScore: Record<string, { count: number; info: any }> = {};

  if (topHashtags.length > 0) {
    // For each top hashtag, fetch recent videos and tally creator appearances
    searchLabel = topHashtags.slice(0, 3).map(t => `#${t}`).join(' ');
    console.log(`[TikTok competitors] scanning hashtags: ${searchLabel}`);

    await Promise.all(
      topHashtags.slice(0, 3).map(async (hashtag) => {
        try {
          const res = await fetch(
            `https://ensembledata.com/apis/tt/hashtag/posts?name=${encodeURIComponent(hashtag)}&depth=1&cursor=0&token=${TOKEN}`
          );
          if (!res.ok) return;
          const data = await res.json();

          const videoPosts: any[] =
            data.data?.videos ??
            data.data?.aweme_list ??
            data.data ??
            data.videos ??
            data.aweme_list ??
            [];

          for (const video of videoPosts) {
            const author = video.author ?? video.authorInfo ?? {};
            const uname  = (author.unique_id ?? author.uniqueId ?? author.username ?? '').toLowerCase();
            const fans    = author.follower_count ?? author.fans ?? 0;
            if (!uname || uname === handle.toLowerCase()) continue;
            if (isSimilarUsername(handle, uname)) continue;
            if (fans < 500) continue;

            if (!creatorScore[uname]) {
              creatorScore[uname] = { count: 0, info: author };
            }
            creatorScore[uname].count += 1;
          }
        } catch {
          // hashtag fetch failed, skip
        }
      })
    );
  }

  // If hashtag approach returned results, rank by appearance count
  const rankedByOverlap = Object.entries(creatorScore)
    .filter(([, v]) => v.count >= 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_RESULTS * 2); // fetch extra to allow for filtering

  const competitors: CompetitorProfile[] = [];
  const seen = new Set<string>();

  for (const [uname, { info }] of rankedByOverlap) {
    if (seen.has(uname)) continue;
    seen.add(uname);

    const bio       = (info.signature ?? '').trim();
    const followers = info.follower_count ?? info.fans ?? 0;
    if (!bio && followers < 2000) continue;

    competitors.push({
      platform:     'tiktok',
      username:     uname,
      display_name: info.nickname ?? info.display_name ?? uname,
      avatar_url:   info.avatar_thumb?.url_list?.[0] ?? info.avatarThumb ?? '',
      bio:          bio.slice(0, 120),
      followers,
      verified:     info.custom_verify != null || info.verified === true,
      profile_url:  `https://www.tiktok.com/@${uname}`,
    });

    if (competitors.length >= MAX_RESULTS) break;
  }

  // Fallback: keyword search if hashtag method returned nothing
  if (competitors.length === 0) {
    const keyword = hashtagStr || keywordsFromTitles(posts.map(p => p.title), 3) || handle;
    searchLabel   = keyword.split(' ').map(t => `#${t}`).join(' ');

    const res = await fetch(
      `https://ensembledata.com/apis/tt/user/search?keyword=${encodeURIComponent(keyword)}&cursor=0&token=${TOKEN}`
    ).catch(() => null);

    if (res?.ok) {
      const data = await res.json().catch(() => ({}));
      const users: any[] =
        data.data?.user_list ?? data.data?.users ?? data.user_list ?? data.users ?? [];

      for (const item of users) {
        const user      = item.user_info ?? item.user ?? item;
        const uname     = (user.unique_id ?? user.uniqueId ?? '').toLowerCase();
        const followers = user.follower_count ?? user.fans ?? 0;
        const bio       = (user.signature ?? '').trim();

        if (!uname || isSimilarUsername(handle, uname)) continue;
        if (followers < 500) continue;
        if (seen.has(uname)) continue;
        seen.add(uname);
        if (!bio && followers < 2000) continue;

        competitors.push({
          platform:     'tiktok',
          username:     uname,
          display_name: user.nickname ?? uname,
          avatar_url:   user.avatar_thumb?.url_list?.[0] ?? user.avatarThumb ?? '',
          bio:          bio.slice(0, 120),
          followers,
          verified:     user.custom_verify != null || user.verified === true,
          profile_url:  `https://www.tiktok.com/@${uname}`,
        });
        if (competitors.length >= MAX_RESULTS) break;
      }
    }
  }

  return { competitors, searchLabel };
}

// ── Instagram ─────────────────────────────────────────────────────────────────

async function findInstagramCompetitors(
  handle: string,
  posts: PostData[]
): Promise<{ competitors: CompetitorProfile[]; searchLabel: string }> {
  const PILOTERR_KEY = process.env.PILOTERR_API_KEY;
  if (!PILOTERR_KEY) return { competitors: [], searchLabel: '' };

  let users: any[] = [];
  let searchLabel  = 'related accounts';

  const res = await fetch(
    `https://api.piloterr.com/api/v2/instagram/user/related?query=${encodeURIComponent(handle)}`,
    { headers: { 'x-api-key': PILOTERR_KEY } }
  ).catch(() => null);

  if (res?.ok) {
    const data = await res.json().catch(() => ({}));
    users = data.data?.users ?? data.users ?? data.data ?? [];
  }

  if (users.length === 0) {
    const kw = hashtagsFromPosts(posts, 2) || keywordsFromTitles(posts.map(p => p.title), 2);
    searchLabel = kw ? kw.split(' ').map(t => `#${t}`).join(' ') : handle;
    const searchRes = await fetch(
      `https://api.piloterr.com/api/v2/instagram/user/search?query=${encodeURIComponent(kw || handle)}`,
      { headers: { 'x-api-key': PILOTERR_KEY } }
    ).catch(() => null);
    if (searchRes?.ok) {
      const d = await searchRes.json().catch(() => ({}));
      users = d.data?.users ?? d.users ?? d.data ?? [];
    }
  }

  const competitors: CompetitorProfile[] = [];
  for (const u of users) {
    const uname = (u.username ?? '').toLowerCase();
    if (!uname || isSimilarUsername(handle, uname)) continue;
    competitors.push({
      platform:     'instagram',
      username:     uname,
      display_name: u.full_name ?? u.name ?? uname,
      avatar_url:   u.profile_pic_url ?? u.profile_pic_url_hd ?? '',
      bio:          (u.biography ?? u.bio ?? '').slice(0, 120),
      followers:    u.edge_followed_by?.count ?? u.follower_count ?? u.followers_count ?? 0,
      verified:     u.is_verified ?? false,
      profile_url:  `https://www.instagram.com/${uname}`,
    });
    if (competitors.length >= MAX_RESULTS) break;
  }

  return { competitors, searchLabel };
}

// ── Twitter ───────────────────────────────────────────────────────────────────

async function findTwitterCompetitors(
  handle: string,
  posts: PostData[]
): Promise<{ competitors: CompetitorProfile[]; searchLabel: string }> {
  const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.TWITTER_RAPIDAPI_HOST ?? 'twitter135.p.rapidapi.com';
  if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'your-rapidapi-key-here') {
    return { competitors: [], searchLabel: '' };
  }

  const hashtags  = hashtagsFromPosts(posts, 3);
  const titleKeys = keywordsFromTitles(posts.map(p => p.title), 3);
  const query     = hashtags || titleKeys || handle;
  const searchLabel = hashtags ? hashtags.split(' ').map(t => `#${t}`).join(' ') : query;

  const url = `https://${RAPIDAPI_HOST}/v2/SearchTimeline?query=${encodeURIComponent(query)}&type=People&count=12`;
  const res = await fetch(url, {
    headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST },
  }).catch(() => null);

  if (!res?.ok) return { competitors: [], searchLabel };
  const data = await res.json().catch(() => ({}));

  const users: any[] = data.users ?? data.data?.users ?? data.data?.user_results ?? [];
  const competitors: CompetitorProfile[] = [];
  for (const item of users) {
    const u     = item.legacy ?? item.user ?? item;
    const uname = (u.screen_name ?? '').toLowerCase();
    if (!uname || isSimilarUsername(handle, uname)) continue;
    competitors.push({
      platform:     'twitter',
      username:     uname,
      display_name: u.name ?? uname,
      avatar_url:   (u.profile_image_url_https ?? '').replace('_normal', '_200x200'),
      bio:          (u.description ?? '').slice(0, 120),
      followers:    u.followers_count ?? 0,
      verified:     u.verified ?? u.is_blue_verified ?? false,
      profile_url:  `https://x.com/${uname}`,
    });
    if (competitors.length >= MAX_RESULTS) break;
  }

  return { competitors, searchLabel };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function findCompetitors(
  platform: Platform,
  handle: string,
  posts: PostData[],
): Promise<{ competitors: CompetitorProfile[]; searchLabel: string }> {
  try {
    switch (platform) {
      case 'youtube':   return await findYouTubeCompetitors(handle, posts);
      case 'tiktok':    return await findTikTokCompetitors(handle, posts);
      case 'instagram': return await findInstagramCompetitors(handle, posts);
      case 'twitter':   return await findTwitterCompetitors(handle, posts);
      default:          return { competitors: [], searchLabel: '' };
    }
  } catch (err) {
    console.error(`[competitors] ${platform}/${handle}:`, (err as Error).message);
    return { competitors: [], searchLabel: '' };
  }
}

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
