import { NextRequest, NextResponse } from 'next/server';
import type { Platform } from '@/lib/types';
import { findCompetitors } from '@/lib/competitors';
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

  // Pull posts from cache — needed for tag/hashtag-based audience-overlap search
  let posts: import('@/lib/types').PostData[] = [];
  try {
    const cached = await getCached(`${platform}:${handle}`, platform);
    if (cached?.posts?.length) posts = cached.posts;
  } catch { /* ignore */ }

  const { competitors, searchLabel } = await findCompetitors(platform, handle, posts);

  return NextResponse.json({ platform, handle, keywords: searchLabel, competitors });
}
