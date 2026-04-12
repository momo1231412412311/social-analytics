import { NextRequest, NextResponse } from 'next/server';
import { getDailyMetrics } from '@/lib/db';

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform') ?? 'all';
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10);
  const metrics = await getDailyMetrics(platform, days);
  return NextResponse.json(metrics);
}
