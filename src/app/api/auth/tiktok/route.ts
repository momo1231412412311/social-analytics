import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getAuthUrl, generateCodeVerifier } from '@/lib/tiktok';

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = generateCodeVerifier();

  const jar = await cookies();
  jar.set('tt_oauth_state', state, {
    httpOnly: true, secure: false, sameSite: 'lax', maxAge: 600, path: '/',
  });
  jar.set('tt_code_verifier', codeVerifier, {
    httpOnly: true, secure: false, sameSite: 'lax', maxAge: 600, path: '/',
  });

  return NextResponse.redirect(getAuthUrl(state, codeVerifier));
}
