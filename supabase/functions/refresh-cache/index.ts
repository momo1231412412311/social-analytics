/**
 * Supabase Edge Function — refresh-cache
 *
 * Runs on a cron schedule (every 24 hours) to automatically re-fetch
 * any cached entries that have exceeded their platform TTL.
 *
 * Deploy:
 *   supabase functions deploy refresh-cache --no-verify-jwt
 *
 * Schedule (in Supabase Dashboard → Edge Functions → refresh-cache → Schedule):
 *   Cron: 0 4 * * *   (runs daily at 4 AM UTC — low-traffic window)
 *
 * Required secrets (set in Supabase Dashboard → Settings → Edge Functions → Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   YOUTUBE_API_KEY
 *   ENSEMBLEDATA_TOKEN
 *   PILOTERR_API_KEY          (optional)
 *   RAPIDAPI_KEY
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_BASE_URL  = Deno.env.get('NEXT_PUBLIC_BASE_URL') ?? 'https://your-site.netlify.app';

// Per-platform TTL in seconds (must match src/lib/db.ts)
const PLATFORM_TTL: Record<string, number> = {
  instagram: 24 * 60 * 60,
  youtube:   6  * 60 * 60,
  tiktok:    6  * 60 * 60,
  twitter:   6  * 60 * 60,
};

interface CacheRow {
  platform:   string;
  handle:     string;
  fetched_at: number;
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const now = Math.floor(Date.now() / 1000);

  // Fetch all cached entries
  const { data: rows, error } = await supabase
    .from('analytics_cache')
    .select('platform, handle, fetched_at')
    .order('fetched_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('Failed to fetch cache entries:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Filter to stale entries
  const stale: CacheRow[] = (rows ?? []).filter((row: CacheRow) => {
    const ttl = PLATFORM_TTL[row.platform] ?? 6 * 60 * 60;
    return now - row.fetched_at > ttl;
  });

  console.log(`Found ${stale.length} stale cache entries out of ${(rows ?? []).length} total`);

  if (stale.length === 0) {
    return new Response(JSON.stringify({ refreshed: 0, message: 'All entries are fresh' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Re-fetch each stale entry via the app's /api/analyze endpoint
  // We use force=true to bypass cache and get fresh data
  let refreshed = 0;
  const errors: string[] = [];

  for (const row of stale) {
    try {
      const url = `${APP_BASE_URL}/api/analyze?platform=${row.platform}&handle=${encodeURIComponent(row.handle)}&force=true`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Rival-CronRefresh/1.0' },
      });

      if (res.ok) {
        refreshed++;
        console.log(`✓ Refreshed ${row.platform}/${row.handle}`);
      } else {
        const body = await res.text();
        errors.push(`${row.platform}/${row.handle}: ${res.status} ${body.slice(0, 100)}`);
        console.warn(`✗ Failed ${row.platform}/${row.handle}: ${res.status}`);
      }

      // Rate-limit: small delay between requests
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${row.platform}/${row.handle}: ${msg}`);
      console.error(`✗ Error ${row.platform}/${row.handle}:`, msg);
    }
  }

  return new Response(
    JSON.stringify({
      refreshed,
      failed: errors.length,
      errors: errors.slice(0, 10),
      total_stale: stale.length,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
