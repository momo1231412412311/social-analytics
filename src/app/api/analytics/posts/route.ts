import { NextRequest, NextResponse } from 'next/server';
import { getTopPosts } from '@/lib/db';

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform') ?? 'all';
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '12', 10);
  const posts = await getTopPosts(platform, limit);
  return NextResponse.json(posts);
}
