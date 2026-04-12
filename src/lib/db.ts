/**
 * Supabase database client and typed query helpers.
 *
 * All functions are async — they use the Supabase PostgREST API over HTTPS,
 * which is ideal for serverless (no raw TCP connection pooling needed).
 *
 * The service-role key is used server-side only; it bypasses RLS.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _client;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Connection {
  id: number;
  platform: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: number | null;
  user_id: string | null;
  username: string | null;
  avatar_url: string | null;
  last_synced_at: number | null;
  created_at: number;
}

export interface DailyMetric {
  platform: string;
  date: string;
  reach: number;
  impressions: number;
  followers: number;
  engagement_rate: number;
  watch_time_minutes: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  saves: number;
}

export interface Post {
  id: number;
  platform: string;
  post_id: string;
  title: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  post_url: string | null;
  media_type: string | null;
  published_at: number | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  reach: number;
  impressions: number;
  engagement_rate: number;
  watch_time_minutes: number;
  saves: number;
}

// ── Connections ───────────────────────────────────────────────────────────────

export async function getConnection(platform: string): Promise<Connection | null> {
  const { data, error } = await getClient()
    .from('platform_connections')
    .select('*')
    .eq('platform', platform)
    .maybeSingle();
  if (error) throw error;
  return data as Connection | null;
}

export async function getAllConnections(): Promise<Connection[]> {
  const { data, error } = await getClient()
    .from('platform_connections')
    .select('*');
  if (error) throw error;
  return (data ?? []) as Connection[];
}

export async function upsertConnection(input: {
  platform: string;
  access_token: string;
  refresh_token?: string | null;
  token_expires_at?: number | null;
  user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
}): Promise<void> {
  // Fetch existing first so we can merge nullable fields (don't overwrite with null)
  const existing = await getConnection(input.platform);
  const row = {
    platform: input.platform,
    access_token: input.access_token,
    refresh_token: input.refresh_token ?? existing?.refresh_token ?? null,
    token_expires_at: input.token_expires_at ?? existing?.token_expires_at ?? null,
    user_id: input.user_id ?? existing?.user_id ?? null,
    username: input.username ?? existing?.username ?? null,
    avatar_url: input.avatar_url ?? existing?.avatar_url ?? null,
  };
  const { error } = await getClient()
    .from('platform_connections')
    .upsert(row, { onConflict: 'platform' });
  if (error) throw error;
}

export async function updateLastSynced(platform: string): Promise<void> {
  const { error } = await getClient()
    .from('platform_connections')
    .update({ last_synced_at: Math.floor(Date.now() / 1000) })
    .eq('platform', platform);
  if (error) throw error;
}

export async function deleteConnection(platform: string): Promise<void> {
  const { error } = await getClient()
    .from('platform_connections')
    .delete()
    .eq('platform', platform);
  if (error) throw error;
}

// ── Daily metrics ─────────────────────────────────────────────────────────────

export async function upsertDailyMetric(
  data: Partial<DailyMetric> & { platform: string; date: string }
): Promise<void> {
  // Uses the upsert_daily_metric stored procedure for merge semantics
  // (preserves existing column values when new value is undefined/null)
  const { error } = await getClient().rpc('upsert_daily_metric', {
    p_platform:           data.platform,
    p_date:               data.date,
    p_reach:              data.reach              ?? null,
    p_impressions:        data.impressions        ?? null,
    p_followers:          data.followers          ?? null,
    p_engagement_rate:    data.engagement_rate    ?? null,
    p_watch_time_minutes: data.watch_time_minutes ?? null,
    p_likes:              data.likes              ?? null,
    p_comments:           data.comments           ?? null,
    p_shares:             data.shares             ?? null,
    p_views:              data.views              ?? null,
    p_saves:              data.saves              ?? null,
  });
  if (error) throw error;
}

export async function getDailyMetrics(
  platform: string | null,
  days = 30
): Promise<DailyMetric[]> {
  const sinceDate = new Date(Date.now() - days * 86400_000)
    .toISOString()
    .split('T')[0];

  if (platform && platform !== 'all') {
    const { data, error } = await getClient()
      .from('daily_metrics')
      .select('*')
      .eq('platform', platform)
      .gte('date', sinceDate)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as DailyMetric[];
  }

  // Fetch all platforms then aggregate in JS
  const { data, error } = await getClient()
    .from('daily_metrics')
    .select('*')
    .gte('date', sinceDate)
    .order('date', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as DailyMetric[];
  const byDate = new Map<string, DailyMetric>();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, { ...row, platform: 'all' });
    } else {
      byDate.set(row.date, {
        ...existing,
        platform: 'all',
        reach:              existing.reach + row.reach,
        impressions:        existing.impressions + row.impressions,
        followers:          Math.max(existing.followers, row.followers),
        engagement_rate:    (existing.engagement_rate + row.engagement_rate) / 2,
        watch_time_minutes: existing.watch_time_minutes + row.watch_time_minutes,
        likes:              existing.likes + row.likes,
        comments:           existing.comments + row.comments,
        shares:             existing.shares + row.shares,
        views:              existing.views + row.views,
        saves:              existing.saves + row.saves,
      });
    }
  }
  return Array.from(byDate.values());
}

export async function getRecentMetricsForEngagement(
  platform: string,
  limit = 30
): Promise<Pick<DailyMetric, 'date' | 'likes' | 'comments' | 'saves' | 'reach'>[]> {
  const { data, error } = await getClient()
    .from('daily_metrics')
    .select('date, likes, comments, saves, reach')
    .eq('platform', platform)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Pick<DailyMetric, 'date' | 'likes' | 'comments' | 'saves' | 'reach'>[];
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export async function upsertPost(data: Omit<Post, 'id'>): Promise<void> {
  const { error } = await getClient()
    .from('posts')
    .upsert(
      { ...data, fetched_at: Math.floor(Date.now() / 1000) },
      { onConflict: 'platform,post_id' }
    );
  if (error) throw error;
}

export async function getTopPosts(
  platform: string | null,
  limit = 12
): Promise<Post[]> {
  let query = getClient()
    .from('posts')
    .select('*')
    .order('engagement_rate', { ascending: false })
    .order('views', { ascending: false })
    .limit(limit);

  if (platform && platform !== 'all') {
    query = query.eq('platform', platform);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Post[];
}

// ── Audience demographics ─────────────────────────────────────────────────────

export async function upsertAudienceDemographic(data: {
  platform: string;
  date: string;
  dimension: string;
  label: string;
  value: number;
}): Promise<void> {
  const { error } = await getClient()
    .from('audience_demographics')
    .upsert(data, { onConflict: 'platform,date,dimension,label' });
  if (error) throw error;
}

export async function getAudienceDemographics(
  platform: string | null
): Promise<Array<{ platform: string; dimension: string; label: string; value: number }>> {
  // Find the latest date (per platform or global)
  let latestQuery = getClient()
    .from('audience_demographics')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);
  if (platform && platform !== 'all') {
    latestQuery = latestQuery.eq('platform', platform);
  }
  const { data: latestData } = await latestQuery;
  const latestDate = latestData?.[0]?.date;
  if (!latestDate) return [];

  let query = getClient()
    .from('audience_demographics')
    .select('platform, dimension, label, value')
    .eq('date', latestDate);
  if (platform && platform !== 'all') {
    query = query.eq('platform', platform);
  }

  const { data, error } = await query;
  if (error) throw error;

  if (!platform || platform === 'all') {
    // Average across platforms
    const map = new Map<string, { count: number; total: number; dimension: string; label: string }>();
    for (const row of data ?? []) {
      const key = `${row.dimension}::${row.label}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { dimension: row.dimension, label: row.label, count: 1, total: row.value });
      } else {
        existing.count++;
        existing.total += row.value;
      }
    }
    return Array.from(map.values()).map(({ dimension, label, count, total }) => ({
      platform: 'all',
      dimension,
      label,
      value: total / count,
    }));
  }

  return (data ?? []) as Array<{ platform: string; dimension: string; label: string; value: number }>;
}

// ── Posting time stats ────────────────────────────────────────────────────────

export async function upsertPostingTimeStat(data: {
  platform: string;
  day_of_week: number;
  hour_of_day: number;
  engagement: number;
}): Promise<void> {
  const { error } = await getClient().rpc('upsert_posting_time_stat', {
    p_platform:    data.platform,
    p_day_of_week: data.day_of_week,
    p_hour_of_day: data.hour_of_day,
    p_engagement:  data.engagement,
  });
  if (error) throw error;
}

export async function getPostingTimeStats(
  platform: string | null
): Promise<Array<{ day_of_week: number; hour_of_day: number; avg_engagement: number; post_count: number }>> {
  let query = getClient().from('posting_time_stats').select('*');
  if (platform && platform !== 'all') {
    query = query.eq('platform', platform);
  }
  const { data, error } = await query;
  if (error) throw error;

  if (!platform || platform === 'all') {
    // Average across platforms
    const map = new Map<string, { day: number; hour: number; total: number; count: number; posts: number }>();
    for (const row of data ?? []) {
      const key = `${row.day_of_week}:${row.hour_of_day}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { day: row.day_of_week, hour: row.hour_of_day, total: row.avg_engagement, count: 1, posts: row.post_count });
      } else {
        existing.total += row.avg_engagement;
        existing.count++;
        existing.posts += row.post_count;
      }
    }
    return Array.from(map.values()).map(({ day, hour, total, count, posts }) => ({
      day_of_week: day,
      hour_of_day: hour,
      avg_engagement: total / count,
      post_count: posts,
    }));
  }

  return (data ?? []) as Array<{ day_of_week: number; hour_of_day: number; avg_engagement: number; post_count: number }>;
}

// ── Overview aggregation ──────────────────────────────────────────────────────

export async function getOverviewStats(
  platform: string | null,
  days = 30
): Promise<{
  reach: number;
  impressions: number;
  followers: number;
  follower_growth: number;
  follower_growth_pct: number;
  avg_engagement_rate: number;
  watch_time_minutes: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  saves: number;
  days: number;
} | null> {
  const metrics = await getDailyMetrics(platform, days);
  if (metrics.length === 0) return null;

  const latest   = metrics[metrics.length - 1];
  const previous = metrics.length > 7 ? metrics[metrics.length - 8] : metrics[0];

  const totals = metrics.reduce(
    (acc, m) => ({
      reach:              acc.reach + m.reach,
      impressions:        acc.impressions + m.impressions,
      likes:              acc.likes + m.likes,
      comments:           acc.comments + m.comments,
      shares:             acc.shares + m.shares,
      views:              acc.views + m.views,
      saves:              acc.saves + m.saves,
      watch_time_minutes: acc.watch_time_minutes + m.watch_time_minutes,
    }),
    { reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, views: 0, saves: 0, watch_time_minutes: 0 }
  );

  const avgEngagement = metrics.reduce((a, m) => a + m.engagement_rate, 0) / metrics.length;
  const followerGrowth = previous ? latest.followers - previous.followers : 0;
  const followerGrowthPct = previous && previous.followers > 0
    ? (followerGrowth / previous.followers) * 100
    : 0;

  return {
    ...totals,
    followers: latest.followers,
    follower_growth: followerGrowth,
    follower_growth_pct: followerGrowthPct,
    avg_engagement_rate: avgEngagement,
    days,
  };
}
