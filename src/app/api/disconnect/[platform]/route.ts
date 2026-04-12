import { NextRequest, NextResponse } from 'next/server';
import { deleteConnection } from '@/lib/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const allowed = ['instagram', 'tiktok', 'youtube'];
  if (!allowed.includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }
  await deleteConnection(platform);
  return NextResponse.json({ ok: true });
}
