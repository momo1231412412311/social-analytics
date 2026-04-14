import { NextRequest, NextResponse } from 'next/server';
import { getCached, setCached } from '@/lib/db';
import { parseHandle } from '@/lib/parseHandle';
import type { Platform } from '@/lib/types';

const ALLOWED: Platform[] = ['instagram', 'tiktok', 'youtube', 'twitter'];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform') as Platform | null;
  const input    = searchParams.get('handle')?.trim();
  const force    = searchParams.get('force') === 'true';

  if (!platform || !ALLOWED.includes(platform)) {
    return NextResponse.json(
      { error: `Invalid platform. Use: ${ALLOWED.join(', ')}.` },
      { status: 400 }
    );
  }
  if (!input) {
    return NextResponse.json({ error: 'Missing handle parameter.' }, { status: 400 });
  }

  const parsed = parseHandle(input, platform);

  // Cache check (pass platform for per-platform TTL)
  if (!force) {
    const cached = await getCached(parsed.cacheKey, platform).catch(() => null);
    if (cached) return NextResponse.json(cached);
  }

  // Live fetch
  try {
    let result;

    if (platform === 'youtube') {
      const { fetchYouTube } = await import('@/lib/platforms/youtube');
      result = await fetchYouTube(parsed.handle, parsed.ytResolutionHint);
    } else if (platform === 'instagram') {
      const { fetchInstagram } = await import('@/lib/platforms/instagram');
      result = await fetchInstagram(parsed.handle);
    } else if (platform === 'twitter') {
      const { fetchTwitter } = await import('@/lib/platforms/twitter');
      result = await fetchTwitter(parsed.handle);
    } else {
      const { fetchTikTok } = await import('@/lib/platforms/tiktok');
      result = await fetchTikTok(parsed.handle);
    }

    // Cache in background (don't block response)
    setCached(parsed.cacheKey, result, platform).catch(console.error);

    return NextResponse.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[analyze] ${platform}/${parsed.handle}:`, msg);

    if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('not found or private')) {
      return NextResponse.json({ error: `Profile not found: @${parsed.handle}` }, { status: 404 });
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('API key') || msg.includes('not set')) {
      return NextResponse.json(
        { error: `API key error — ${msg}` },
        { status: 502 }
      );
    }
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
      return NextResponse.json({ error: 'Rate limit reached. Try again in a moment.' }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url  = new URL(req.url);
  if (body.platform) url.searchParams.set('platform', body.platform);
  if (body.handle)   url.searchParams.set('handle',   body.handle);
  if (body.force)    url.searchParams.set('force',    'true');
  return GET(new NextRequest(url, req));
}
