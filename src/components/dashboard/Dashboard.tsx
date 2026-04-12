'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import MetricCard from './MetricCard';
import ConnectPlatform from './ConnectPlatform';
import TopPosts from './TopPosts';
import SyncButton from './SyncButton';
import FollowerGrowthChart from '../charts/FollowerGrowthChart';
import EngagementChart from '../charts/EngagementChart';
import AudienceDemographicsChart from '../charts/AudienceDemographicsChart';
import PostingTimesHeatmap from '../charts/PostingTimesHeatmap';
import {
  Users, Eye, TrendingUp, Clock, Heart, MessageCircle, Share2, Bookmark,
} from 'lucide-react';

const PLATFORMS = [
  { id: 'all',       label: 'All Platforms', icon: '📊' },
  { id: 'instagram', label: 'Instagram',      icon: '📷' },
  { id: 'tiktok',    label: 'TikTok',         icon: '🎵' },
  { id: 'youtube',   label: 'YouTube',        icon: '▶️' },
] as const;

type Platform = typeof PLATFORMS[number]['id'];

interface Connection {
  platform: string;
  username: string | null;
  avatar_url: string | null;
  last_synced_at: number | null;
}

interface Overview {
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
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatMinutes(mins: number): string {
  if (mins >= 60 * 24) return `${(mins / (60 * 24)).toFixed(1)}d`;
  if (mins >= 60) return `${(mins / 60).toFixed(1)}h`;
  return `${Math.round(mins)}m`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'Never';
  const diffMs = Date.now() - ts * 1000;
  const diffH = diffMs / 3_600_000;
  if (diffH < 1) return `${Math.round(diffH * 60)}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activePlatform, setActivePlatform] = useState<Platform>('all');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [growthData, setGrowthData] = useState<unknown[]>([]);
  const [posts, setPosts] = useState<unknown[]>([]);
  const [audience, setAudience] = useState<unknown[]>([]);
  const [postingTimes, setPostingTimes] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Handle OAuth return messages
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      showToast(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected! Starting sync…`);
      router.replace('/');
      // Auto-sync after connect
      fetch(`/api/sync?platform=${connected}&force=true`, { method: 'POST' })
        .then(() => fetchAll(activePlatform));
    }
    if (error) {
      const msgs: Record<string, string> = {
        instagram_no_business_account: 'No Instagram Business/Creator account found. Make sure your Instagram is connected to a Facebook Page.',
        instagram_denied: 'Instagram connection cancelled.',
        tiktok_denied: 'TikTok connection cancelled.',
        youtube_denied: 'YouTube connection cancelled.',
      };
      showToast(msgs[error] ?? `Connection error: ${error}`, 'error');
      router.replace('/');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = useCallback(async (platform: Platform) => {
    setLoading(true);
    try {
      const [conns, ov, growth, ps, aud, pt] = await Promise.all([
        fetch('/api/connections').then(r => r.json()),
        fetch(`/api/analytics/overview?platform=${platform}&days=30`).then(r => r.json()),
        fetch(`/api/analytics/growth?platform=${platform}&days=30`).then(r => r.json()),
        fetch(`/api/analytics/posts?platform=${platform}&limit=12`).then(r => r.json()),
        fetch(`/api/analytics/audience?platform=${platform}`).then(r => r.json()),
        fetch(`/api/analytics/posting-times?platform=${platform}`).then(r => r.json()),
      ]);
      setConnections(conns);
      setOverview(Object.keys(ov).length ? ov : null);
      setGrowthData(growth);
      setPosts(ps);
      setAudience(aud);
      setPostingTimes(pt);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll(activePlatform);
  }, [activePlatform, fetchAll]);

  const handleSync = async (force = false) => {
    setSyncing(true);
    try {
      const res = await fetch(
        `/api/sync?platform=${activePlatform}&force=${force}`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (data.ok) {
        showToast('Sync complete');
        fetchAll(activePlatform);
      } else {
        showToast(`Sync failed: ${data.error}`, 'error');
      }
    } catch {
      showToast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async (platform: string) => {
    if (!confirm(`Disconnect ${platform}? Your stored data will remain but no new data will be fetched.`)) return;
    await fetch(`/api/disconnect/${platform}`, { method: 'POST' });
    showToast(`${platform} disconnected`);
    fetchAll(activePlatform);
  };

  const connectedPlatforms = connections.map(c => c.platform);
  const lastSynced = connections.length
    ? Math.max(...connections.map(c => c.last_synced_at ?? 0))
    : null;

  const platformConn = activePlatform !== 'all'
    ? connections.find(c => c.platform === activePlatform)
    : null;

  const hasData = growthData.length > 0 || posts.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium animate-fade-in ${
          toast.type === 'error'
            ? 'bg-red-900/90 text-red-200 border border-red-700'
            : 'bg-emerald-900/90 text-emerald-200 border border-emerald-700'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">Social Analytics</span>
            {lastSynced && (
              <span className="text-xs text-zinc-500 hidden sm:block">
                · synced {timeAgo(lastSynced)}
              </span>
            )}
          </div>
          <SyncButton syncing={syncing} onSync={() => handleSync(true)} />
        </div>
      </header>

      {/* Platform tabs */}
      <div className="border-b border-zinc-800 bg-zinc-950/60 sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto py-2">
          {PLATFORMS.map(p => {
            const isConnected = p.id === 'all' || connectedPlatforms.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => setActivePlatform(p.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                  activePlatform === p.id
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                } ${!isConnected && (p.id as string) !== 'all' ? 'opacity-50' : ''}`}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
                {!isConnected && (p.id as string) !== 'all' && (
                  <span className="text-[10px] text-zinc-500">·</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Connect cards for disconnected platforms */}
        {(activePlatform === 'all' || !connectedPlatforms.includes(activePlatform)) && (
          <div className={`grid gap-4 ${
            activePlatform === 'all'
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-1 max-w-sm'
          }`}>
            {(activePlatform === 'all'
              ? ['instagram', 'tiktok', 'youtube'] as const
              : [activePlatform] as const
            )
              .filter(p => !connectedPlatforms.includes(p))
              .map(p => (
                <ConnectPlatform key={p} platform={p} />
              ))
            }
          </div>
        )}

        {/* Connected platform header */}
        {platformConn && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {platformConn.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={platformConn.avatar_url}
                  alt={platformConn.username ?? ''}
                  className="w-10 h-10 rounded-full ring-2 ring-zinc-700"
                />
              )}
              <div>
                <p className="font-semibold text-white">
                  @{platformConn.username}
                </p>
                <p className="text-xs text-zinc-500">
                  Last synced: {timeAgo(platformConn.last_synced_at)}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDisconnect(activePlatform)}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* No data state */}
        {!loading && connectedPlatforms.length > 0 && !hasData && (
          <div className="card p-8 text-center">
            <p className="text-zinc-400 mb-3">No data yet. Sync to fetch your analytics.</p>
            <button
              onClick={() => handleSync(true)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Sync Now
            </button>
          </div>
        )}

        {/* Metric cards */}
        {(hasData || loading) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Total Reach"
              value={overview ? formatNumber(overview.reach) : '—'}
              icon={<Eye className="w-4 h-4" />}
              loading={loading}
              platform={activePlatform !== 'all' ? activePlatform : undefined}
            />
            <MetricCard
              label="Impressions"
              value={overview ? formatNumber(overview.impressions) : '—'}
              icon={<TrendingUp className="w-4 h-4" />}
              loading={loading}
              platform={activePlatform !== 'all' ? activePlatform : undefined}
            />
            <MetricCard
              label="Engagement Rate"
              value={overview ? `${overview.avg_engagement_rate.toFixed(2)}%` : '—'}
              icon={<Heart className="w-4 h-4" />}
              loading={loading}
              platform={activePlatform !== 'all' ? activePlatform : undefined}
            />
            <MetricCard
              label="Followers"
              value={overview ? formatNumber(overview.followers) : '—'}
              subValue={overview?.follower_growth
                ? `${overview.follower_growth > 0 ? '+' : ''}${formatNumber(overview.follower_growth)} (${overview.follower_growth_pct.toFixed(1)}%)`
                : undefined
              }
              positive={overview ? overview.follower_growth >= 0 : undefined}
              icon={<Users className="w-4 h-4" />}
              loading={loading}
              platform={activePlatform !== 'all' ? activePlatform : undefined}
            />
          </div>
        )}

        {/* Secondary metrics */}
        {(hasData || loading) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Total Views"
              value={overview ? formatNumber(overview.views) : '—'}
              icon={<Eye className="w-4 h-4" />}
              loading={loading}
              size="sm"
            />
            <MetricCard
              label="Watch Time"
              value={overview ? formatMinutes(overview.watch_time_minutes) : '—'}
              icon={<Clock className="w-4 h-4" />}
              loading={loading}
              size="sm"
            />
            <MetricCard
              label="Total Likes"
              value={overview ? formatNumber(overview.likes) : '—'}
              icon={<Heart className="w-4 h-4" />}
              loading={loading}
              size="sm"
            />
            <MetricCard
              label="Comments"
              value={overview ? formatNumber(overview.comments) : '—'}
              icon={<MessageCircle className="w-4 h-4" />}
              loading={loading}
              size="sm"
            />
          </div>
        )}

        {/* Charts row 1 */}
        {(hasData || loading) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4">Follower Growth</h2>
              {loading
                ? <div className="h-48 animate-pulse bg-zinc-800 rounded-lg" />
                : <FollowerGrowthChart data={growthData as Parameters<typeof FollowerGrowthChart>[0]['data']} />
              }
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4">Engagement & Reach (30d)</h2>
              {loading
                ? <div className="h-48 animate-pulse bg-zinc-800 rounded-lg" />
                : <EngagementChart data={growthData as Parameters<typeof EngagementChart>[0]['data']} />
              }
            </div>
          </div>
        )}

        {/* Charts row 2 */}
        {(hasData || loading) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-1">Audience Demographics</h2>
              <p className="text-xs text-zinc-500 mb-4">Age &amp; gender breakdown</p>
              {loading
                ? <div className="h-48 animate-pulse bg-zinc-800 rounded-lg" />
                : <AudienceDemographicsChart data={audience as Parameters<typeof AudienceDemographicsChart>[0]['data']} />
              }
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-zinc-300 mb-1">Best Posting Times</h2>
              <p className="text-xs text-zinc-500 mb-4">Average engagement by day &amp; hour</p>
              {loading
                ? <div className="h-48 animate-pulse bg-zinc-800 rounded-lg" />
                : <PostingTimesHeatmap data={postingTimes as Parameters<typeof PostingTimesHeatmap>[0]['data']} />
              }
            </div>
          </div>
        )}

        {/* Top posts */}
        {(hasData || loading) && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-300">Top Posts</h2>
              <span className="text-xs text-zinc-500">by engagement rate</span>
            </div>
            {loading
              ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="aspect-square bg-zinc-800 rounded-lg animate-pulse" />
                  ))}
                </div>
              )
              : <TopPosts posts={posts as Parameters<typeof TopPosts>[0]['posts']} />
            }
          </div>
        )}

        {/* Empty state when nothing connected */}
        {!loading && connectedPlatforms.length === 0 && (
          <div className="card p-12 text-center">
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-xl font-semibold text-white mb-2">Connect your accounts</h2>
            <p className="text-zinc-400 max-w-sm mx-auto text-sm">
              Link your Instagram, TikTok, and YouTube accounts above to start tracking your analytics.
            </p>
          </div>
        )}

        {/* Stats row at bottom */}
        {hasData && overview && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">30-Day Summary</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2 text-zinc-400">
                <Heart className="w-3.5 h-3.5 text-pink-500" />
                <span>{formatNumber(overview.likes)} likes</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
                <span>{formatNumber(overview.comments)} comments</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <Share2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>{formatNumber(overview.shares)} shares</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-400">
                <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                <span>{formatNumber(overview.saves)} saves</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading…</div>}>
      <DashboardInner />
    </Suspense>
  );
}
