import { NextResponse } from 'next/server';
import { getAllConnections } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const conns = await getAllConnections();
  return NextResponse.json(
    conns.map((c) => ({
      platform: c.platform,
      username: c.username,
      avatar_url: c.avatar_url,
      last_synced_at: c.last_synced_at,
      connected: true,
    }))
  );
}
