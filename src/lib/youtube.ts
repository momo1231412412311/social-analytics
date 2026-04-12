/**
 * YouTube Data API v3 + YouTube Analytics API client
 *
 * Docs:
 *   https://developers.google.com/youtube/v3
 *   https://developers.google.com/youtube/analytics
 */

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID!;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.URL ?? 'http://localhost:3000';
const REDIRECT_URI = `${BASE_URL}/api/auth/youtube/callback`;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_ANALYTICS = 'https://youtubeanalytics.googleapis.com/v2';

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`YouTube token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`YouTube token refresh failed: ${await res.text()}`);
  return res.json();
}

// ── YouTube Data API ──────────────────────────────────────────────────────────

async function ytGet(path: string, params: Record<string, string>, accessToken: string) {
  const url = new URL(`${YT_API}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`YouTube API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string;
  subscriber_count: number;
  view_count: number;
  video_count: number;
}

export async function getChannelInfo(accessToken: string): Promise<YouTubeChannel | null> {
  const data = await ytGet('/channels', {
    part: 'snippet,statistics',
    mine: 'true',
  }, accessToken);

  const ch = data.items?.[0];
  if (!ch) return null;
  return {
    id: ch.id,
    title: ch.snippet.title,
    description: ch.snippet.description,
    thumbnail_url: ch.snippet.thumbnails?.default?.url ?? '',
    subscriber_count: parseInt(ch.statistics.subscriberCount ?? '0', 10),
    view_count: parseInt(ch.statistics.viewCount ?? '0', 10),
    video_count: parseInt(ch.statistics.videoCount ?? '0', 10),
  };
}

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail_url: string;
  published_at: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  duration: string;
}

export async function getChannelVideos(
  channelId: string,
  accessToken: string,
  maxResults = 50
): Promise<YouTubeVideo[]> {
  // Search for videos
  const searchData = await ytGet('/search', {
    part: 'id',
    channelId,
    type: 'video',
    order: 'date',
    maxResults: String(Math.min(maxResults, 50)),
  }, accessToken);

  const ids = (searchData.items ?? []).map((i: { id: { videoId: string } }) => i.id.videoId).join(',');
  if (!ids) return [];

  // Get video details
  const videoData = await ytGet('/videos', {
    part: 'snippet,statistics,contentDetails',
    id: ids,
  }, accessToken);

  return (videoData.items ?? []).map((v: {
    id: string;
    snippet: { title: string; thumbnails: { medium?: { url: string } }; publishedAt: string };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails: { duration: string };
  }) => ({
    id: v.id,
    title: v.snippet.title,
    thumbnail_url: v.snippet.thumbnails?.medium?.url ?? '',
    published_at: v.snippet.publishedAt,
    view_count: parseInt(v.statistics.viewCount ?? '0', 10),
    like_count: parseInt(v.statistics.likeCount ?? '0', 10),
    comment_count: parseInt(v.statistics.commentCount ?? '0', 10),
    duration: v.contentDetails.duration,
  }));
}

// ── YouTube Analytics API ─────────────────────────────────────────────────────

async function ytAnalyticsGet(
  params: Record<string, string>,
  accessToken: string
) {
  const url = new URL(`${YT_ANALYTICS}/reports`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`YouTube Analytics error ${res.status}: ${await res.text()}`);
  return res.json();
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

export async function getDailyAnalytics(
  channelId: string,
  accessToken: string,
  days = 30
): Promise<Array<{
  date: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
}>> {
  const endDate = isoDate(new Date());
  const startDate = isoDate(new Date(Date.now() - days * 86400_000));

  try {
    const data = await ytAnalyticsGet({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost',
      dimensions: 'day',
      sort: 'day',
    }, accessToken);

    const cols: string[] = (data.columnHeaders ?? []).map((h: { name: string }) => h.name);
    return (data.rows ?? []).map((row: (string | number)[]) => {
      const obj: Record<string, number | string> = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return {
        date: String(obj.day),
        views: Number(obj.views ?? 0),
        estimatedMinutesWatched: Number(obj.estimatedMinutesWatched ?? 0),
        averageViewDuration: Number(obj.averageViewDuration ?? 0),
        likes: Number(obj.likes ?? 0),
        comments: Number(obj.comments ?? 0),
        shares: Number(obj.shares ?? 0),
        subscribersGained: Number(obj.subscribersGained ?? 0),
        subscribersLost: Number(obj.subscribersLost ?? 0),
      };
    });
  } catch {
    return [];
  }
}

export async function getAudienceDemographics(
  channelId: string,
  accessToken: string
): Promise<{
  ageGender: Array<{ ageGroup: string; gender: string; viewerPercentage: number }>;
}> {
  const endDate = isoDate(new Date());
  const startDate = isoDate(new Date(Date.now() - 90 * 86400_000));

  try {
    const data = await ytAnalyticsGet({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'viewerPercentage',
      dimensions: 'ageGroup,gender',
      sort: '-viewerPercentage',
    }, accessToken);

    const rows = data.rows ?? [];
    return {
      ageGender: rows.map((r: [string, string, number]) => ({
        ageGroup: r[0],
        gender: r[1],
        viewerPercentage: r[2],
      })),
    };
  } catch {
    return { ageGender: [] };
  }
}

export async function getVideoAnalytics(
  channelId: string,
  videoId: string,
  accessToken: string
): Promise<{
  views: number;
  estimatedMinutesWatched: number;
  likes: number;
  comments: number;
}> {
  const endDate = isoDate(new Date());
  const startDate = isoDate(new Date(Date.now() - 365 * 86400_000));

  try {
    const data = await ytAnalyticsGet({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'views,estimatedMinutesWatched,likes,comments',
      filters: `video==${videoId}`,
    }, accessToken);

    const row = data.rows?.[0];
    if (!row) return { views: 0, estimatedMinutesWatched: 0, likes: 0, comments: 0 };
    return {
      views: Number(row[0] ?? 0),
      estimatedMinutesWatched: Number(row[1] ?? 0),
      likes: Number(row[2] ?? 0),
      comments: Number(row[3] ?? 0),
    };
  } catch {
    return { views: 0, estimatedMinutesWatched: 0, likes: 0, comments: 0 };
  }
}
