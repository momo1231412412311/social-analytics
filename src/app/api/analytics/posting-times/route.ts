import { NextRequest, NextResponse } from 'next/server';
import { getPostingTimeStats } from '@/lib/db';

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform') ?? 'all';
  const data = await getPostingTimeStats(platform);
  return NextResponse.json(data);
}
