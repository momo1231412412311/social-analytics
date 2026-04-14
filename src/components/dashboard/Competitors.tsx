'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, ExternalLink, Loader2, RefreshCw, ChevronRight } from 'lucide-react';
import type { Platform } from '@/lib/types';
import type { CompetitorProfile } from '@/lib/competitors';

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? n.toLocaleString() : '';
}

interface Props {
  platform: Platform;
  handle: string;
  /** Called when user clicks "Analyze" on a competitor */
  onAnalyze: (platform: Platform, handle: string) => void;
}

export default function Competitors({ platform, handle, onAnalyze }: Props) {
  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [keywords, setKeywords]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(
        `/api/competitors?platform=${platform}&handle=${encodeURIComponent(handle)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setCompetitors(data.competitors ?? []);
      setKeywords(data.keywords ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [platform, handle]);

  // Auto-load after a short delay so it doesn't block the main results
  useEffect(() => {
    const t = setTimeout(load, 600);
    return () => clearTimeout(t);
  }, [load]);

  // Platform color accents
  const accentClass: Record<Platform, string> = {
    youtube:   'text-red-400',
    tiktok:    'text-pink-400',
    instagram: 'text-purple-400',
    twitter:   'text-sky-400',
  };

  return (
    <div className="card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Similar Creators
          </h2>
          {keywords && !loading && (
            <p className="text-[11px] text-zinc-600 mt-0.5">
              Based on: <span className="text-zinc-500 italic">&ldquo;{keywords.slice(0, 60)}{keywords.length > 60 ? '…' : ''}&rdquo;</span>
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          title="Refresh competitors"
          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-4 text-zinc-600 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Finding similar creators…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <p className="text-xs text-zinc-600 py-2">
          Could not load competitors — {error}
        </p>
      )}

      {/* Empty */}
      {!loading && !error && competitors.length === 0 && (
        <p className="text-xs text-zinc-600 py-2">
          No similar creators found. Make sure the relevant API key is configured.
        </p>
      )}

      {/* Competitor grid */}
      {!loading && competitors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {competitors.map((c) => (
            <div
              key={`${c.platform}-${c.username}`}
              className="group flex flex-col gap-2 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/40 hover:border-zinc-600/60 hover:bg-zinc-800/60 transition-all"
            >
              {/* Avatar + name */}
              <div className="flex items-center gap-2.5">
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatar_url}
                    alt={c.display_name}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-zinc-700"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-zinc-400">
                      {c.display_name.slice(0, 1).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-tight">
                    {c.display_name}
                    {c.verified && (
                      <span className={`ml-1 text-[10px] ${accentClass[platform]}`}>✓</span>
                    )}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">@{c.username}</p>
                </div>
              </div>

              {/* Followers */}
              {c.followers > 0 && (
                <p className="text-[11px] text-zinc-500">
                  <span className="font-semibold text-zinc-300">{fmt(c.followers)}</span> followers
                </p>
              )}

              {/* Bio snippet */}
              {c.bio && (
                <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                  {c.bio}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-1">
                <button
                  onClick={() => onAnalyze(c.platform, c.username)}
                  className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold
                    bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 hover:text-white transition-colors`}
                >
                  <ChevronRight className="w-3 h-3" />
                  Analyze
                </button>
                <a
                  href={c.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  title="Open profile"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
