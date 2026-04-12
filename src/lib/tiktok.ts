/**
 * TikTok for Business API v2 client
 *
 * Uses PKCE-based OAuth 2.0 flow (TikTok requires code_verifier).
 *
 * Docs: https://developers.tiktok.com/doc/overview
 */

import crypto from 'crypto';

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY!;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.URL ?? 'http://localhost:3000';
const REDIRECT_URI = `${BASE_URL}/api/auth/tiktok/callback`;

const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API_BASE = 'https://open.tiktokapis.com/v2';

// ── PKCE helpers ─────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function getAuthUrl(state: string, codeVerifier: string): string {
  const challenge = generateCodeChallenge(codeVerifier);
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope: 'user.info.basic,video.list',
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

export async function exchangeCode(
  code: string,
  codeVerifier: string
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`TikTok token exchange failed: ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(`TikTok: ${json.error_description ?? json.error}`);
  return json.data ?? json;
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
}> {
  const body = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`TikTok token refresh failed: ${await res.text()}`);
  const json = await res.json();
  return json.data ?? json;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet(path: string, accessToken: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`TikTok API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, accessToken: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TikTok API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface TikTokUser {
  open_id: string;
  display_name: string;
  avatar_url: string;
  follower_count: number;
  following_count: number;
  likes_count: number;
  video_count: number;
}

export async function getUserInfo(accessToken: string): Promise<TikTokUser> {
  const data = await apiGet(
    '/user/info/',
    accessToken,
    {
      fields:
        'open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count',
    }
  );
  return data.data?.user ?? {};
}

export interface TikTokVideo {
  id: string;
  title: string;
  cover_image_url: string;
  share_url: string;
  create_time: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  duration: number;
}

export async function getVideoList(
  accessToken: string,
  maxCount = 20
): Promise<TikTokVideo[]> {
  const fields = [
    'id', 'title', 'cover_image_url', 'share_url', 'create_time',
    'like_count', 'comment_count', 'share_count', 'view_count', 'duration',
  ].join(',');

  try {
    const data = await apiPost('/video/list/', accessToken, {
      fields: fields.split(','),
      max_count: maxCount,
    });
    return data.data?.videos ?? [];
  } catch {
    // Fallback to query endpoint
    try {
      const data = await apiPost('/video/query/', accessToken, {
        fields: fields.split(','),
        filters: { video_ids: [] },
      });
      return data.data?.videos ?? [];
    } catch {
      return [];
    }
  }
}
