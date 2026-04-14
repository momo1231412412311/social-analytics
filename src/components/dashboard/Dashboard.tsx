'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Loader2, RefreshCw, X, Clock, TrendingUp, Eye, Heart,
  MessageCircle, Zap, BarChart2, Download, AlertCircle, Users, Repeat2,
} from 'lucide-react';
import type { AnalyticsResult, Platform } from '@/lib/types';
import ProfileHeader from './ProfileHeader';
import MetricCard from './MetricCard';
import TopPosts from './TopPosts';
import Competitors from './Competitors';
import VideoPerformanceChart from '../charts/VideoPerformanceChart';
import PostingFrequencyChart from '../charts/PostingFrequencyChart';
import ContentTypeChart from '../charts/ContentTypeChart';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function escapeCsv(v: string | number | boolean | undefined | null): string {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportCsv(result: AnalyticsResult) {
  const headers = [
    'platform', 'handle', 'display_name', 'followers', 'following', 'post_count',
    'avg_views', 'avg_likes', 'avg_comments', 'avg_engagement_rate',
    'posting_freq_per_week', 'best_content_type',
    'post_id', 'post_title', 'post_url', 'published_at',
    'views', 'likes', 'comments', 'shares', 'engagement_rate', 'content_type',
  ];

  const rows: string[][] = result.posts.length === 0
    ? [[
        result.platform, result.handle, result.profile.display_name,
        String(result.profile.followers), String(result.profile.following),
        String(result.profile.post_count), String(result.summary.avg_views),
        String(result.summary.avg_likes), String(result.summary.avg_comments),
        result.summary.avg_engagement_rate.toFixed(2),
        String(result.summary.posting_frequency_per_week),
        result.summary.best_content_type,
        '', '', '', '', '', '', '', '', '', '',
      ]]
    : result.posts.map(p => [
        result.platform, result.handle, result.profile.display_name,
        String(result.profile.followers), String(result.profile.following),
        String(result.profile.post_count), String(result.summary.avg_views),
        String(result.summary.avg_likes), String(result.summary.avg_comments),
        result.summary.avg_engagement_rate.toFixed(2),
        String(result.summary.posting_frequency_per_week),
        result.summary.best_content_type,
        p.id, p.title, p.post_url, p.published_at,
        String(p.views), String(p.likes), String(p.comments), String(p.shares),
        p.engagement_rate.toFixed(2), p.content_type,
      ]);

  const csv = [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `rival-${result.platform}-${result.handle}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Platform config ───────────────────────────────────────────────────────────

const PLATFORMS: { id: Platform; label: string; placeholder: string }[] = [
  { id: 'youtube',   label: 'YouTube',   placeholder: '@MrBeast or channel URL'        },
  { id: 'tiktok',    label: 'TikTok',    placeholder: '@charlidamelio or profile URL'  },
  { id: 'instagram', label: 'Instagram', placeholder: '@cristiano or profile URL'      },
  { id: 'twitter',   label: 'X / Twitter', placeholder: '@elonmusk or profile URL'    },
];

const PLATFORM_ICON: Record<Platform, string> = {
  youtube: 'YT', tiktok: 'TK', instagram: 'IG', twitter: 'X',
};

// ── Recent searches ───────────────────────────────────────────────────────────

const RECENT_KEY = 'recent_searches_v2';
interface RecentSearch { platform: Platform; handle: string; display_name?: string }

function loadRecent(): RecentSearch[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}
function saveRecent(item: RecentSearch) {
  const prev = loadRecent().filter(r => !(r.platform === item.platform && r.handle === item.handle));
  localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...prev].slice(0, 8)));
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="card h-28" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="card h-20" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card h-56" />
        <div className="card h-56" />
      </div>
      <div className="card h-64" />
      <div className="card h-80" />
    </div>
  );
}

// ── Single platform result ────────────────────────────────────────────────────

function PlatformResult({
  result,
  onRefresh,
  onAnalyze,
}: {
  result: AnalyticsResult;
  onRefresh: () => void;
  onAnalyze: (platform: Platform, handle: string) => void;
}) {
  const isTwitter = result.platform === 'twitter';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Profile header + action buttons */}
      <div className="flex items-start gap-2">
        <div className="flex-1"><ProfileHeader result={result} /></div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => exportCsv(result)}
            title="Export to CSV"
            className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-emerald-400 transition-colors flex items-center gap-1.5 text-xs"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            onClick={onRefresh}
            title="Force refresh"
            className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status banners */}
      {result.from_cache && (
        <p className="text-[11px] text-zinc-600 -mt-2 pl-1">
          Showing cached data · hit ↻ to refresh
        </p>
      )}
      {result.limited_data && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-xs text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Limited data — no Piloterr API key configured. Add{' '}
            <code className="font-mono">PILOTERR_API_KEY</code> to{' '}
            <code className="font-mono">.env.local</code> to unlock full post metrics.
          </span>
        </div>
      )}

      {/* Metrics row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Avg Views / Post"  value={fmt(result.summary.avg_views)}
          icon={<Eye className="w-4 h-4" />} accent="bg-violet-500/5" />
        <MetricCard label="Avg Engagement"
          value={`${result.summary.avg_engagement_rate.toFixed(2)}%`}
          icon={<TrendingUp className="w-4 h-4" />} accent="bg-emerald-500/5"
          positive={result.summary.avg_engagement_rate >= 2} />
        <MetricCard label={isTwitter ? 'Avg Likes / Tweet' : 'Avg Likes / Post'}
          value={fmt(result.summary.avg_likes)} icon={<Heart className="w-4 h-4" />} />
        <MetricCard label={isTwitter ? 'Avg Replies' : 'Avg Comments'}
          value={fmt(result.summary.avg_comments)} icon={<MessageCircle className="w-4 h-4" />} />
      </div>

      {/* Metrics row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Views (sample)" value={fmt(result.summary.total_views)}
          icon={<Eye className="w-4 h-4" />} />
        <MetricCard
          label={isTwitter ? 'Tweets / Week' : 'Posts / Week'}
          value={result.summary.posting_frequency_per_week > 0
            ? String(result.summary.posting_frequency_per_week) : '—'}
          icon={<Zap className="w-4 h-4" />} />
        <MetricCard label="Followers" value={fmt(result.profile.followers)}
          icon={<Users className="w-4 h-4" />} />
        {isTwitter
          ? <MetricCard label="Avg Retweets"
              value={fmt(result.posts.length
                ? Math.round(result.posts.reduce((s,p) => s + p.shares, 0) / result.posts.length)
                : 0)}
              icon={<Repeat2 className="w-4 h-4" />} />
          : <MetricCard label="Best Content Type"
              value={result.summary.best_content_type} sub="by avg views" />
        }
      </div>

      {/* Charts (only when post data exists) */}
      {result.posts.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                {isTwitter ? 'Tweet Performance Over Time' : 'Video Performance Over Time'}
              </h2>
              <p className="text-[11px] text-zinc-600 mb-3">Views per post, chronological</p>
              <VideoPerformanceChart posts={result.posts} />
            </div>
            <div className="card p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                Posting Frequency
              </h2>
              <p className="text-[11px] text-zinc-600 mb-3">Posts per week</p>
              <PostingFrequencyChart posts={result.posts} />
            </div>
          </div>

          {result.summary.top_content_types.length > 1 && (
            <div className="card p-4">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                Best Performing Content Type
              </h2>
              <p className="text-[11px] text-zinc-600 mb-3">Average views by format</p>
              <ContentTypeChart types={result.summary.top_content_types} />
            </div>
          )}

          <div className="card p-4">
            <div className="mb-3">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                {isTwitter ? 'Top 10 Tweets by Views' : 'Top 10 Posts by Views'}
              </h2>
              <p className="text-[11px] text-zinc-600">with like/comment ratio</p>
            </div>
            <TopPosts posts={result.posts} />
          </div>
        </>
      )}

      {result.posts.length === 0 && !result.limited_data && (
        <div className="card p-8 text-center text-zinc-500 text-sm">
          No public posts found for this profile.
        </div>
      )}

      {/* ── Competitor finder ──────────────────────────────────────── */}
      <Competitors
        platform={result.platform}
        handle={result.handle}
        onAnalyze={onAnalyze}
      />
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<AnalyticsResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [recent, setRecent]     = useState<RecentSearch[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRecent(loadRecent()); }, []);

  const search = useCallback(async (p: Platform, handle: string, force = false) => {
    const q = handle.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `/api/analyze?platform=${p}&handle=${encodeURIComponent(q)}${force ? '&force=true' : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setResult(data as AnalyticsResult);
      saveRecent({ platform: p, handle: data.handle ?? q, display_name: data.profile?.display_name });
      setRecent(loadRecent());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSearch = () => { setInput(''); setResult(null); setError(null); };

  const activePlatform = PLATFORMS.find(p => p.id === platform)!;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-violet-400" />
          <span className="font-bold text-sm text-white">Rival</span>
          <span className="text-zinc-600 text-sm">·</span>
          <span className="text-xs text-zinc-500">Public analytics for any creator</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Search area */}
        <div className="space-y-3">
          {/* Platform tabs */}
          <div className="flex gap-1 flex-wrap">
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                onClick={() => { setPlatform(p.id); setResult(null); setError(null); inputRef.current?.focus(); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  platform === p.id
                    ? 'bg-zinc-800 text-white ring-1 ring-zinc-600'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <form onSubmit={(e) => { e.preventDefault(); search(platform, input); }} className="relative">
            <div className="relative flex items-center rounded-xl border bg-zinc-900 border-zinc-700 transition-colors focus-within:border-zinc-500">
              <Search className="absolute left-4 w-4 h-4 text-zinc-500 pointer-events-none" />
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={activePlatform.placeholder}
                className="w-full bg-transparent pl-11 pr-32 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              {input && (
                <button type="button" onClick={clearSearch}
                  className="absolute right-24 p-1 text-zinc-500 hover:text-zinc-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="absolute right-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center gap-1.5"
              >
                {loading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Fetching…</>
                  : <><Search className="w-3.5 h-3.5" />Analyze</>}
              </button>
            </div>
          </form>

          {/* Recent searches */}
          {!loading && !result && !error && recent.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Clock className="w-3 h-3 text-zinc-600 flex-shrink-0" />
              {recent.map((r, i) => (
                <button key={i}
                  onClick={() => { setPlatform(r.platform); setInput(r.handle); search(r.platform, r.handle); }}
                  className="px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
                  <span className="text-[10px] text-zinc-600 font-mono">{PLATFORM_ICON[r.platform]}</span>
                  @{r.handle}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="card border-red-900/50 bg-red-950/20 p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Search failed</p>
              <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && <Skeleton />}

        {/* Results */}
        {result && !loading && (
          <PlatformResult
            result={result}
            onRefresh={() => search(result.platform, result.handle, true)}
            onAnalyze={(p, h) => { setPlatform(p); setInput(h); search(p, h); }}
          />
        )}

        {/* Empty state */}
        {!loading && !result && !error && (
          <div className="text-center py-20 space-y-2">
            <p className="text-zinc-600 text-sm">Enter any creator handle or URL above to get started.</p>
            <p className="text-zinc-700 text-xs">Works with public profiles · YouTube · TikTok · Instagram · X</p>
          </div>
        )}
      </main>
    </div>
  );
}
