import { NextRequest, NextResponse } from 'next/server';
import { getAudienceDemographics } from '@/lib/db';

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform') ?? 'all';
  const data = await getAudienceDemographics(platform);
  return NextResponse.json(data);
}
