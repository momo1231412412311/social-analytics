import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCode, getLongLivedToken, getInstagramAccountId } from '@/lib/instagram';
import { upsertConnection } from '@/lib/db';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.URL ?? 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${BASE_URL}/?error=instagram_denied`);
  }

  const jar = await cookies();
  const savedState = jar.get('ig_oauth_state')?.value;
  if (!state || state !== savedState) {
    return NextResponse.redirect(`${BASE_URL}/?error=instagram_state_mismatch`);
  }
  jar.delete('ig_oauth_state');

  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/?error=instagram_no_code`);
  }

  try {
    const { access_token: shortToken } = await exchangeCode(code);
    const longLived = await getLongLivedToken(shortToken);
    const expiresAt = Math.floor(Date.now() / 1000) + (longLived.expires_in ?? 60 * 86400);

    const igAccount = await getInstagramAccountId(longLived.access_token);
    if (!igAccount) {
      return NextResponse.redirect(`${BASE_URL}/?error=instagram_no_business_account`);
    }

    await upsertConnection({
      platform: 'instagram',
      access_token: longLived.access_token,
      token_expires_at: expiresAt,
      user_id: igAccount.ig_id,
      username: igAccount.username,
      avatar_url: igAccount.profile_picture_url,
    });

    return NextResponse.redirect(`${BASE_URL}/?connected=instagram`);
  } catch (err) {
    console.error('Instagram OAuth error:', err);
    return NextResponse.redirect(`${BASE_URL}/?error=instagram_failed`);
  }
}
