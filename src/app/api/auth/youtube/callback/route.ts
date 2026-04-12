import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCode, getChannelInfo } from '@/lib/youtube';
import { upsertConnection } from '@/lib/db';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.URL ?? 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${BASE_URL}/?error=youtube_denied`);
  }

  const jar = await cookies();
  const savedState = jar.get('yt_oauth_state')?.value;
  if (!state || state !== savedState) {
    return NextResponse.redirect(`${BASE_URL}/?error=youtube_state_mismatch`);
  }
  jar.delete('yt_oauth_state');

  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/?error=youtube_no_code`);
  }

  try {
    const tokens = await exchangeCode(code);
    const channel = await getChannelInfo(tokens.access_token);

    await upsertConnection({
      platform: 'youtube',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
      user_id: channel?.id ?? null,
      username: channel?.title ?? null,
      avatar_url: channel?.thumbnail_url ?? null,
    });

    return NextResponse.redirect(`${BASE_URL}/?connected=youtube`);
  } catch (err) {
    console.error('YouTube OAuth error:', err);
    return NextResponse.redirect(`${BASE_URL}/?error=youtube_failed`);
  }
}
