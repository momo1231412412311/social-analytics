import Image from 'next/image';
import { BadgeCheck, ExternalLink } from 'lucide-react';
import type { AnalyticsResult, Platform } from '@/lib/types';

const platformColors: Record<Platform, string> = {
  instagram: 'from-purple-600 via-pink-600 to-orange-500',
  tiktok:    'from-zinc-900 via-pink-700 to-cyan-600',
  youtube:   'from-red-700 to-red-500',
  twitter:   'from-sky-600 to-sky-400',
};

const platformLabel: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok:    'TikTok',
  youtube:   'YouTube',
  twitter:   'X / Twitter',
};

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function ProfileHeader({ result }: { result: AnalyticsResult }) {
  const { profile, platform, summary } = result;

  return (
    <div className="card overflow-hidden">
      {/* Platform colour bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${platformColors[platform]}`} />

      <div className="p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.display_name}
              width={72}
              height={72}
              className="rounded-full ring-2 ring-zinc-700 object-cover"
              unoptimized
            />
          ) : (
            <div className={`w-[72px] h-[72px] rounded-full bg-gradient-to-br ${platformColors[platform]} flex items-center justify-center text-2xl font-bold text-white`}>
              {profile.display_name[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <span className={`absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r ${platformColors[platform]} text-white`}>
            {platformLabel[platform]}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-lg font-bold text-white truncate">{profile.display_name}</h1>
            {profile.verified && (
              <BadgeCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-zinc-400">@{profile.username}</p>
          {profile.bio && (
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{profile.bio}</p>
          )}
        </div>

        {/* Quick stats */}
        <div className="flex gap-4 text-center flex-shrink-0">
          <div>
            <p className="text-lg font-bold text-white tabular-nums">{fmt(profile.followers)}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Followers</p>
          </div>
          {profile.following > 0 && (
            <div>
              <p className="text-lg font-bold text-white tabular-nums">{fmt(profile.following)}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Following</p>
            </div>
          )}
          <div>
            <p className="text-lg font-bold text-white tabular-nums">{fmt(profile.post_count)}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
              {platform === 'twitter' ? 'Tweets' : 'Posts'}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold text-white tabular-nums">
              {summary.posting_frequency_per_week > 0
                ? `${summary.posting_frequency_per_week}/wk`
                : '—'}
            </p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Freq</p>
          </div>
        </div>

        {/* External link */}
        <a
          href={profile.profile_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          title="Open profile"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
