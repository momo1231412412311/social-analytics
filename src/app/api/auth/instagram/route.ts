import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getAuthUrl } from '@/lib/instagram';

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex');
  (await cookies()).set('ig_oauth_state', state, {
    httpOnly: true,
    secure: false, // localhost
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return NextResponse.redirect(getAuthUrl(state));
}
