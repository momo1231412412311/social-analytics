/**
 * Instagram Graph API client
 *
 * Uses the Meta (Facebook) OAuth flow to obtain a page/Instagram Business
 * account access token, then pulls insights, media, and audience data.
 *
 * Docs: https://developers.facebook.com/docs/instagram-api
 */

const APP_ID = process.env.INSTAGRAM_APP_ID!;
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.URL ?? 'http://localhost:3000';
const REDIRECT_URI = `${BASE_URL}/api/auth/instagram/callback`;
const FB_API = 'https://graph.facebook.com/v19.0';

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: [
      'instagram_basic',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
    ].join(','),
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/dialog/oauth?${params}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  token_type: string;
}> {
  const params = new URLSearchParams({
    client_id: APP_ID,
    client_secret: APP_SECRET,
    redirect_uri: REDIRECT_URI,
    code,
  });
  const res = await fetch(`${FB_API}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function getLongLivedToken(shortToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${FB_API}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error(`Long-lived token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshLongLivedToken(token: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: token,
  });
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params}`);
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

/** Returns the first Instagram Business/Creator account linked to the user's pages */
export async function getInstagramAccountId(accessToken: string): Promise<{
  ig_id: string;
  username: string;
  name: string;
  profile_picture_url: string;
} | null> {
  // 1. Get pages
  const pagesRes = await fetch(
    `${FB_API}/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`
  );
  if (!pagesRes.ok) throw new Error(`Failed to fetch pages: ${await pagesRes.text()}`);
  const pages = await pagesRes.json();

  for (const page of pages.data ?? []) {
    const igAcct = page.instagram_business_account;
    if (!igAcct?.id) continue;

    // 2. Get IG account details
    const igRes = await fetch(
      `${FB_API}/${igAcct.id}?fields=id,username,name,profile_picture_url&access_token=${accessToken}`
    );
    if (!igRes.ok) continue;
    const ig = await igRes.json();
    return {
      ig_id: ig.id,
      username: ig.username,
      name: ig.name,
      profile_picture_url: ig.profile_picture_url,
    };
  }
  return null;
}

export async function fetchInsights(
  igUserId: string,
  accessToken: string,
  days = 30
): Promise<Array<{ date: string; metric: string; value: number }>> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;

  const metrics = ['reach', 'impressions'];
  const results: Array<{ date: string; metric: string; value: number }> = [];

  for (const metric of metrics) {
    try {
      const params = new URLSearchParams({
        metric,
        period: 'day',
        since: String(since),
        until: String(until),
        access_token: accessToken,
      });
      const res = await fetch(`${FB_API}/${igUserId}/insights?${params}`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data.data?.[0]?.values ?? []) {
        results.push({
          date: item.end_time.split('T')[0],
          metric,
          value: item.value,
        });
      }
    } catch {
      // skip metric on error
    }
  }
  return results;
}

export async function fetchFollowerCount(
  igUserId: string,
  accessToken: string
): Promise<number> {
  const res = await fetch(
    `${FB_API}/${igUserId}?fields=followers_count&access_token=${accessToken}`
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data.followers_count ?? 0;
}

export interface IGMedia {
  id: string;
  caption?: string;
  media_type: string;
  thumbnail_url?: string;
  media_url?: string;
  permalink: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  reach?: number;
  impressions?: number;
  saved?: number;
  engagement?: number;
}

export async function fetchMedia(
  igUserId: string,
  accessToken: string,
  limit = 50
): Promise<IGMedia[]> {
  const fields = [
    'id', 'caption', 'media_type', 'thumbnail_url', 'media_url',
    'permalink', 'timestamp', 'like_count', 'comments_count',
  ].join(',');

  const res = await fetch(
    `${FB_API}/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  const items: IGMedia[] = data.data ?? [];

  // Fetch per-post insights (reach, impressions, saved, engagement)
  const enriched = await Promise.all(
    items.map(async (item) => {
      try {
        const insightMetrics = item.media_type === 'VIDEO'
          ? 'reach,impressions,saved,video_views'
          : 'reach,impressions,saved,engagement';
        const iRes = await fetch(
          `${FB_API}/${item.id}/insights?metric=${insightMetrics}&access_token=${accessToken}`
        );
        if (!iRes.ok) return item;
        const iData = await iRes.json();
        const map: Record<string, number> = {};
        for (const d of iData.data ?? []) map[d.name] = d.values?.[0]?.value ?? 0;
        return { ...item, ...map };
      } catch {
        return item;
      }
    })
  );
  return enriched;
}

export async function fetchAudienceDemographics(
  igUserId: string,
  accessToken: string
): Promise<{ ageGender: Record<string, number>; city: Record<string, number> }> {
  const params = new URLSearchParams({
    metric: 'audience_gender_age,audience_city',
    period: 'lifetime',
    access_token: accessToken,
  });
  const res = await fetch(`${FB_API}/${igUserId}/insights?${params}`);
  if (!res.ok) return { ageGender: {}, city: {} };
  const data = await res.json();
  const ageGender: Record<string, number> = {};
  const city: Record<string, number> = {};
  for (const item of data.data ?? []) {
    if (item.name === 'audience_gender_age') {
      Object.assign(ageGender, item.values?.[0]?.value ?? {});
    } else if (item.name === 'audience_city') {
      Object.assign(city, item.values?.[0]?.value ?? {});
    }
  }
  return { ageGender, city };
}
