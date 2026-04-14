import { NextRequest, NextResponse } from 'next/server';
import type { Platform } from '@/lib/types';
import { findCompetitors, extractKeywords } from '@/lib/competitors';
import { getCached } from '@/lib/db';

const ALLOWED: Platform[] = ['instagram', 'tiktok', 'youtube', 'twitter'];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform') as Platform | null;
  const handle   = searchParams.get('handle')?.trim().replace(/^@/, '').toLowerCase();

  if (!platform || !ALLOWED.includes(platform)) {
    return NextResponse.json(
      { error: `Invalid platform. Use: ${ALLOWED.join(', ')}.` },
      { status: 400 }
    );
  }
  if (!handle) {
    return NextResponse.json({ error: 'Missing handle parameter.' }, { status: 400 });
  }

  // Pull keywords from cached analytics result if available
  let keywords = handle; // fallback
  try {
    const cached = await getCached(`${platform}:${handle}`, platform);
    if (cached) {
      keywords = extractKeywords(
        cached.profile.display_name,
        cached.profile.bio,
        handle
      );
    }
  } catch {
    // ignore cache miss
  }

  const competitors = await findCompetitors(platform, handle, keywords);

  return NextResponse.json({ platform, handle, keywords, competitors });
}
