import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getAuthUrl } from '@/lib/youtube';

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex');
  (await cookies()).set('yt_oauth_state', state, {
    httpOnly: true, secure: false, sameSite: 'lax', maxAge: 600, path: '/',
  });
  return NextResponse.redirect(getAuthUrl(state));
}
