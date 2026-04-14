/**
 * Twitter/X public profile data via RapidAPI (Twitter135 / Twitter-API45).
 *
 * Uses RAPIDAPI_KEY env var. Subscribe to one of these on RapidAPI (free tier available):
 *   - "Twitter135" by twitter135  → host: twitter135.p.rapidapi.com
 *   - "Twitter API v2" by socialdata → host: twttrapi.p.rapidapi.com
 *
 * The code tries Twitter135 first (most reliable free tier), with a fallback shape.
 */

import type { AnalyticsResult, PostData, ContentType } from '../types';
import { calcFrequency, calcContentTypes } from './youtube';

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY ?? '';
const RAPIDAPI_HOST = process.env.TWITTER_RAPIDAPI_HOST ?? 'twitter135.p.rapidapi.com';
const BASE          = `https://${RAPIDAPI_HOST}`;

/* eslint-disable @typescript-eslint/no-explicit-any */

async function twitterGet(path: string, params: Record<string, string> = {}) {
  if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'your-rapidapi-key-here') {
    throw new Error('RAPIDAPI_KEY is not set. Get a free key at https://rapidapi.com and subscribe to Twitter135.');
  }

  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-key':  RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST,
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('RapidAPI key invalid or Twitter API subscription missing. Check RAPIDAPI_KEY.');
  }
  if (res.status === 404) {
    throw new Error(`Twitter/X profile not found`);
  }
  if (res.status === 429) {
    throw new Error('RapidAPI rate limit reached. Try again in a moment.');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Twitter/X API ${res.status}: ${body.slice(0, 300)}`);
  }

  return res.json();
}

// ── Content type detection ────────────────────────────────────────────────────

function tweetContentType(tweet: any): ContentType {
  if (tweet.entities?.media?.some((m: any) => m.type === 'video' || m.type === 'animated_gif')) return 'video';
  if (tweet.entities?.media?.some((m: any) => m.type === 'photo')) return 'photo';
  return 'tweet';
}

// ── Tweet mapper ──────────────────────────────────────────────────────────────

function mapTweet(tweet: any): PostData {
  // Handle nested legacy object (Twitter v2 graph shape)
  const t      = tweet.legacy ?? tweet.tweet ?? tweet;
  const views  = parseInt(t.views?.count ?? tweet.views?.count ?? '0', 10);
  const likes  = t.favorite_count  ?? t.likes         ?? 0;
  const rts    = t.retweet_count   ?? t.retweets      ?? 0;
  const cmts   = t.reply_count     ?? t.replies       ?? 0;
  const quotes = t.quote_count     ?? 0;
  const created = t.created_at ?? tweet.created_at ?? '';

  const thumb =
    t.entities?.media?.[0]?.media_url_https ??
    tweet.entities?.media?.[0]?.media_url_https ??
    '';

  const tweetId = t.id_str ?? tweet.id_str ?? tweet.id ?? String(Math.random());
  const username = t.user?.screen_name ?? tweet.user?.screen_name ?? tweet.author_id ?? '';

  const engBase = views > 0 ? views : Math.max(likes + rts + cmts, 1) * 100;
  const engRate = ((likes + rts + cmts) / engBase) * 100;

  return {
    id:               String(tweetId),
    title:            (t.full_text ?? t.text ?? tweet.text ?? '').slice(0, 280),
    thumbnail_url:    thumb,
    post_url:         `https://x.com/${username}/status/${tweetId}`,
    published_at:     created ? new Date(created).toISOString() : new Date().toISOString(),
    views,
    likes,
    comments:         cmts,
    shares:           rts + quotes,
    duration_seconds: 0,
    content_type:     tweetContentType(t),
    engagement_rate:  engRate,
  };
}

// ── Profile mapper ────────────────────────────────────────────────────────────

function mapProfile(user: any): AnalyticsResult['profile'] {
  const u = user.legacy ?? user.user ?? user;
  return {
    username:     u.screen_name    ?? user.screen_name    ?? '',
    display_name: u.name           ?? user.name           ?? '',
    avatar_url:   (u.profile_image_url_https ?? user.profile_image_url_https ?? '')
                    .replace('_normal', '_400x400'),
    bio:          u.description    ?? user.description    ?? '',
    followers:    u.followers_count ?? user.followers_count ?? 0,
    following:    u.friends_count  ?? user.friends_count  ?? 0,
    post_count:   u.statuses_count ?? user.statuses_count ?? 0,
    total_likes:  u.favourites_count ?? user.favourites_count ?? 0,
    verified:     u.verified       ?? user.verified       ?? u.is_blue_verified ?? false,
    profile_url:  `https://x.com/${u.screen_name ?? user.screen_name ?? ''}`,
  };
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchTwitter(handle: string): Promise<AnalyticsResult> {
  const cleanHandle = handle.replace(/^@/, '');

  // Get user profile + recent tweets
  // Twitter135 endpoints: /v2/UserByScreenName + /v2/UserTweets
  let userJson: any;
  let tweetsJson: any;

  try {
    userJson   = await twitterGet('/v2/UserByScreenName', { username: cleanHandle });
    const userId =
      userJson.data?.user?.result?.rest_id ??
      userJson.data?.user?.result?.id ??
      userJson.user?.id_str ??
      userJson.id_str;

    if (!userId) throw new Error('Could not resolve Twitter user ID');

    tweetsJson = await twitterGet('/v2/UserTweets', { userId, count: '40' });
  } catch (err) {
    const msg = (err as Error).message;
    // Re-throw auth/not-found errors immediately
    if (msg.includes('not found') || msg.includes('not set') || msg.includes('invalid')) {
      throw err;
    }
    // If UserTweets failed but we have user info, continue with empty tweets
    if (userJson && !tweetsJson) {
      tweetsJson = { data: { user: { result: { timeline_v2: { timeline: { instructions: [] } } } } } };
    } else {
      throw err;
    }
  }

  // Extract user object (handle multiple response shapes)
  const userResult =
    userJson.data?.user?.result ??
    userJson.data?.user         ??
    userJson.user               ??
    userJson;

  if (!userResult?.legacy && !userResult?.screen_name && !userResult?.name) {
    throw new Error(`Twitter/X profile not found: @${cleanHandle}`);
  }

  // Extract tweets from timeline instructions
  const instructions: any[] =
    tweetsJson.data?.user?.result?.timeline_v2?.timeline?.instructions ??
    tweetsJson.data?.user?.result?.timeline?.instructions ??
    tweetsJson.timeline?.instructions ??
    [];

  const rawTweets: any[] = [];
  for (const inst of instructions) {
    const entries: any[] = inst.entries ?? inst.entry ? [inst.entry] : [];
    for (const entry of entries) {
      const tweet =
        entry.content?.itemContent?.tweet_results?.result ??
        entry.content?.tweet_results?.result;
      if (tweet) rawTweets.push(tweet);
    }
  }

  // Filter out retweets for metrics
  const ownTweets = rawTweets.filter(t => {
    const leg = t.legacy ?? t;
    return !leg.retweeted_status_id_str && !leg.full_text?.startsWith('RT @');
  });

  const posts: PostData[] = ownTweets.map(mapTweet);
  const sorted = [...posts].sort((a, b) => b.views - a.views || b.likes - a.likes);

  const totalViews  = posts.reduce((s, p) => s + p.views, 0);
  const avgViews    = posts.length ? Math.round(totalViews / posts.length) : 0;
  const avgLikes    = posts.length ? Math.round(posts.reduce((s, p) => s + p.likes, 0) / posts.length) : 0;
  const avgComments = posts.length ? Math.round(posts.reduce((s, p) => s + p.comments, 0) / posts.length) : 0;
  const avgEngRate  = posts.length ? posts.reduce((s, p) => s + p.engagement_rate, 0) / posts.length : 0;
  const topTypes    = calcContentTypes(posts);

  return {
    platform: 'twitter',
    handle:   cleanHandle,
    profile:  mapProfile(userResult),
    summary: {
      avg_views:                  avgViews,
      avg_likes:                  avgLikes,
      avg_comments:               avgComments,
      avg_engagement_rate:        avgEngRate,
      total_views:                totalViews,
      posting_frequency_per_week: calcFrequency(posts.map(p => p.published_at)),
      best_content_type:          topTypes[0]?.type ?? 'tweet',
      top_content_types:          topTypes,
    },
    posts: sorted,
    fetched_at: Math.floor(Date.now() / 1000),
  };
}
