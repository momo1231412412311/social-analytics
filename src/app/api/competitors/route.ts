import { NextRequest, NextResponse } from 'next/server';
import type { Platform } from '@/lib/types';
import { findCompetitors, hashtagsFromPosts, keywordsFromTitles } from '@/lib/competitors';
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

  // Pull posts from cached analytics result — posts are required for good keywords
  let posts: import('@/lib/types').PostData[] = [];
  let keywordsLabel = handle; // shown in UI as "Based on: ..."

  try {
    const cached = await getCached(`${platform}:${handle}`, platform);
    if (cached?.posts?.length) {
      posts = cached.posts;

      // Build the human-readable label for what we're searching on
      const hashtags  = hashtagsFromPosts(posts);
      const titleKeys = keywordsFromTitles(posts.map(p => p.title));
      keywordsLabel   = hashtags
        ? hashtags.split(' ').map(t => `#${t}`).join(' ')
        : titleKeys || handle;
    }
  } catch {
    // ignore cache miss — will still try with empty posts
  }

  const competitors = await findCompetitors(platform, handle, posts);

  return NextResponse.json({
    platform,
    handle,
    keywords: keywordsLabel,
    competitors,
  });
}
