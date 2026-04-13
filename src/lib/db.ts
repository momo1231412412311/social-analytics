/**
 * Supabase cache layer.
 *
 * Single table: analytics_cache — stores the full JSON result keyed by
 * platform+handle. TTL is 6 hours by default.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsResult } from './types';

const CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export async function getCached(cacheKey: string): Promise<AnalyticsResult | null> {
  const [platform, handle] = cacheKey.split(':');
  const { data, error } = await getClient()
    .from('analytics_cache')
    .select('data, fetched_at')
    .eq('platform', platform)
    .eq('handle', handle)
    .maybeSingle();

  if (error || !data) return null;

  const age = Math.floor(Date.now() / 1000) - data.fetched_at;
  if (age > CACHE_TTL_SECONDS) return null;

  return { ...(data.data as AnalyticsResult), from_cache: true };
}

export async function setCached(cacheKey: string, result: AnalyticsResult): Promise<void> {
  const [platform, handle] = cacheKey.split(':');
  const { error } = await getClient()
    .from('analytics_cache')
    .upsert(
      { platform, handle, data: result, fetched_at: Math.floor(Date.now() / 1000) },
      { onConflict: 'platform,handle' }
    );
  if (error) console.error('Cache write error:', error.message);
}

export async function getRecentSearches(limit = 8): Promise<
  Array<{ platform: string; handle: string; fetched_at: number }>
> {
  const { data } = await getClient()
    .from('analytics_cache')
    .select('platform, handle, fetched_at')
    .order('fetched_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{ platform: string; handle: string; fetched_at: number }>;
}
