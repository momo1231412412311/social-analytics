/**
 * Instagram public data via direct scraping (no API key required).
 *
 * Strategy:
 *   1. Fetch https://www.instagram.com/api/v1/users/web_profile_info/?username={handle}
 *      with the standard Instagram web app-id header. Returns profile + ~12 recent posts.
 *   2. Fall back to parsing embedded JSON from the public profile HTML page
 *      using cheerio if the JSON API returns an error.
 *
 * Note: Instagram aggressively rate-limits scrapers. The Supabase 6-hour cache
 * in db.ts significantly reduces how often these requests are made.
 */

import { load } from 'cheerio';
import type { AnalyticsResult, PostData, ContentType } from '../types';
import { calcFrequency, calcContentTypes } from './youtube';

const IG_APP_ID = '936619743392459';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-ig-app-id':    IG_APP_ID,
  'Referer':         'https://www.instagram.com/',
  'Origin':          'https://www.instagram.com',
};

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Normalization ─────────────────────────────────────────────────────────────

function mediaTypeToContentType(node: any): ContentType {
  if (node.__typename === 'GraphSidecar' || node.media_type === 8) return 'carousel';
  if (node.__typename === 'GraphVideo'   || node.is_video || node.media_type === 2) {
    const dur = node.video_duration ?? 0;
    return dur > 0 && dur <= 65 ? 'short' : 'video';
  }
  return 'photo';
}

function mapNode(node: any): PostData {
  const views    = node.video_view_count  ?? node.view_count  ?? 0;
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
    node.thumbnail_src          ??
    node.display_url            ??
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
    bio:          user.biography    ?? user.bio  ?? '',
    followers:    user.edge_followed_by?.count ?? user.follower_count   ?? user.followers_count ?? 0,
    following:    user.edge_follow?.count      ?? user.following_count  ?? 0,
    post_count:   user.edge_owner_to_timeline_media?.count ?? user.media_count ?? 0,
    total_likes:  0,
    verified:     user.is_verified  ?? false,
    profile_url:  `https://www.instagram.com/${user.username ?? ''}`,
  };
}

// ── Fetch strategies ──────────────────────────────────────────────────────────

/** Strategy 1: Instagram internal JSON API (fastest, no auth needed for public profiles) */
async function fetchViaJsonApi(handle: string): Promise<{ user: any; posts: any[] }> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
  const res = await fetch(url, { headers: FETCH_HEADERS });

  if (!res.ok) {
    throw new Error(`Instagram JSON API returned ${res.status}`);
  }

  const json = await res.json();
  const user = json.data?.user;
  if (!user?.username) throw new Error('No user in Instagram JSON API response');

  const edges: any[] = user.edge_owner_to_timeline_media?.edges ?? [];
  const posts = edges.map((e: any) => e.node);
  return { user, posts };
}

/** Strategy 2: Parse embedded JSON from the profile HTML page */
async function fetchViaHtml(handle: string): Promise<{ user: any; posts: any[] }> {
  const url = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  const res = await fetch(url, { headers: { ...FETCH_HEADERS, Accept: 'text/html,application/xhtml+xml' } });

  if (!res.ok) throw new Error(`Instagram profile page returned ${res.status}`);

  const html = await res.text();

  // Instagram embeds profile JSON in <script type="application/json"> tags
  // and sometimes in window._sharedData / window.__additionalDataLoaded
  const $ = load(html);
  let user: any = null;
  let posts: any[] = [];

  // Try <script type="application/json"> blocks
  $('script[type="application/json"]').each((_, el) => {
    if (user) return;
    try {
      const raw = $(el).html() ?? '';
      const parsed = JSON.parse(raw);
      // Walk the serialized React tree looking for user data
      const found = findUserInObject(parsed);
      if (found?.username) { user = found; posts = found.posts ?? []; }
    } catch { /* ignore parse errors */ }
  });

  // Try window._sharedData pattern in inline scripts
  if (!user) {
    $('script').each((_, el) => {
      if (user) return;
      const text = $(el).html() ?? '';
      const match = text.match(/window\._sharedData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/)
                 ?? text.match(/window\._sharedData\s*=\s*(\{[\s\S]+?\});/);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          const profilePage = data?.entry_data?.ProfilePage?.[0]?.graphql?.user;
          if (profilePage?.username) {
            user  = profilePage;
            posts = profilePage.edge_owner_to_timeline_media?.edges?.map((e: any) => e.node) ?? [];
          }
        } catch { /* ignore */ }
      }
    });
  }

  if (!user?.username) {
    throw new Error(
      'Could not extract Instagram profile data from page. ' +
      'Instagram may require a login or the account is private.'
    );
  }

  return { user, posts };
}

/** Recursively search a parsed JSON object for an Instagram user node */
function findUserInObject(obj: any, depth = 0): any {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  if (obj.username && (obj.edge_followed_by || obj.follower_count)) return obj;
  for (const val of Object.values(obj)) {
    const found = findUserInObject(val, depth + 1);
    if (found) return found;
  }
  return null;
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchInstagram(handle: string): Promise<AnalyticsResult> {
  const cleanHandle = handle.replace(/^@/, '');

  let user: any;
  let rawPosts: any[];

  try {
    ({ user, posts: rawPosts } = await fetchViaJsonApi(cleanHandle));
  } catch (err) {
    // Fall back to HTML scraping
    try {
      ({ user, posts: rawPosts } = await fetchViaHtml(cleanHandle));
    } catch (htmlErr) {
      // Surface the original JSON API error as it's usually more informative
      throw new Error(
        `Instagram fetch failed. ${(err as Error).message}. ` +
        `HTML fallback: ${(htmlErr as Error).message}`
      );
    }
  }

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
}
