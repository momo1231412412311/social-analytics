import { NextRequest, NextResponse } from 'next/server';
import { syncAll, syncPlatform } from '@/lib/sync';

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform');
  const force = searchParams.get('force') === 'true';

  try {
    if (platform && platform !== 'all') {
      await syncPlatform(platform);
      return NextResponse.json({ ok: true, results: { [platform]: 'ok' } });
    }
    const results = await syncAll(force);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
