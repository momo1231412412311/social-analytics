import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCode, getUserInfo } from '@/lib/tiktok';
import { upsertConnection } from '@/lib/db';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.URL ?? 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${BASE_URL}/?error=tiktok_denied`);
  }

  const jar = await cookies();
  const savedState = jar.get('tt_oauth_state')?.value;
  const codeVerifier = jar.get('tt_code_verifier')?.value;

  if (!state || state !== savedState) {
    return NextResponse.redirect(`${BASE_URL}/?error=tiktok_state_mismatch`);
  }
  jar.delete('tt_oauth_state');
  jar.delete('tt_code_verifier');

  if (!code || !codeVerifier) {
    return NextResponse.redirect(`${BASE_URL}/?error=tiktok_no_code`);
  }

  try {
    const tokens = await exchangeCode(code, codeVerifier);
    const user = await getUserInfo(tokens.access_token);

    await upsertConnection({
      platform: 'tiktok',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
      user_id: tokens.open_id,
      username: user.display_name,
      avatar_url: user.avatar_url,
    });

    return NextResponse.redirect(`${BASE_URL}/?connected=tiktok`);
  } catch (err) {
    console.error('TikTok OAuth error:', err);
    return NextResponse.redirect(`${BASE_URL}/?error=tiktok_failed`);
  }
}
