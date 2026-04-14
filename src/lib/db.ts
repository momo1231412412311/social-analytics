/**
 * Supabase cache layer.
 *
 * Single table: analytics_cache — stores the full JSON result keyed by
 * platform+handle.
 *
 * TTL per platform:
 *   instagram → 24 hours (external API is expensive)
 *   youtube, tiktok, twitter → 6 hours
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsResult } from './types';

const DEFAULT_TTL_SECONDS = 6 * 60 * 60;   // 6 hours

const PLATFORM_TTL: Record<string, number> = {
  instagram: 24 * 60 * 60,   // 24 hours
  youtube:   6  * 60 * 60,
  tiktok:    6  * 60 * 60,
  twitter:   6  * 60 * 60,
};

function ttlFor(platform?: string): number {
  return platform ? (PLATFORM_TTL[platform] ?? DEFAULT_TTL_SECONDS) : DEFAULT_TTL_SECONDS;
}

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('your-project-ref')) {
    throw new Error('Missing or unconfigured SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export async function getCached(
  cacheKey: string,
  platform?: string
): Promise<AnalyticsResult | null> {
  const [p, handle] = cacheKey.split(':');
  const effectivePlatform = platform ?? p;

  try {
    const { data, error } = await getClient()
      .from('analytics_cache')
      .select('data, fetched_at')
      .eq('platform', effectivePlatform)
      .eq('handle', handle)
      .maybeSingle();

    if (error || !data) return null;

    const age = Math.floor(Date.now() / 1000) - data.fetched_at;
    if (age > ttlFor(effectivePlatform)) return null;

    return { ...(data.data as AnalyticsResult), from_cache: true };
  } catch {
    return null;
  }
}

export async function setCached(
  cacheKey: string,
  result: AnalyticsResult,
  platform?: string
): Promise<void> {
  const [p, handle] = cacheKey.split(':');
  const effectivePlatform = platform ?? p;

  try {
    const { error } = await getClient()
      .from('analytics_cache')
      .upsert(
        {
          platform:   effectivePlatform,
          handle,
          data:       result,
          fetched_at: Math.floor(Date.now() / 1000),
        },
        { onConflict: 'platform,handle' }
      );
    if (error) console.error('Cache write error:', error.message);
  } catch (err) {
    console.error('Cache write exception:', (err as Error).message);
  }
}

export async function getRecentSearches(limit = 8): Promise<
  Array<{ platform: string; handle: string; fetched_at: number }>
> {
  try {
    const { data } = await getClient()
      .from('analytics_cache')
      .select('platform, handle, fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(limit);
    return (data ?? []) as Array<{ platform: string; handle: string; fetched_at: number }>;
  } catch {
    return [];
  }
}

/**
 * Refresh all cached entries older than their platform TTL.
 * Called by the Supabase Edge Function cron job.
 */
export async function getStaleEntries(): Promise<
  Array<{ platform: string; handle: string; fetched_at: number }>
> {
  try {
    const now = Math.floor(Date.now() / 1000);
    // Fetch everything and filter by per-platform TTL
    const { data } = await getClient()
      .from('analytics_cache')
      .select('platform, handle, fetched_at')
      .order('fetched_at', { ascending: true })
      .limit(200);

    return (data ?? []).filter(row => {
      const ttl = ttlFor(row.platform);
      return now - row.fetched_at > ttl;
    }) as Array<{ platform: string; handle: string; fetched_at: number }>;
  } catch {
    return [];
  }
}
