'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

const PLATFORM_CONFIG = {
  instagram: {
    label: 'Instagram',
    icon: '📷',
    description: 'Reach, impressions, engagement, audience insights & top posts',
    gradient: 'from-purple-600 via-pink-600 to-orange-500',
    hover: 'hover:shadow-pink-900/30',
    href: '/api/auth/instagram',
  },
  tiktok: {
    label: 'TikTok',
    icon: '🎵',
    description: 'Video views, followers, engagement rate & watch time',
    gradient: 'from-zinc-800 via-pink-700 to-cyan-600',
    hover: 'hover:shadow-cyan-900/30',
    href: '/api/auth/tiktok',
  },
  youtube: {
    label: 'YouTube',
    icon: '▶️',
    description: 'Views, watch time, subscribers, audience demographics & analytics',
    gradient: 'from-red-700 to-red-500',
    hover: 'hover:shadow-red-900/30',
    href: '/api/auth/youtube',
  },
} as const;

type Platform = keyof typeof PLATFORM_CONFIG;

interface ConnectPlatformProps {
  platform: Platform;
}

export default function ConnectPlatform({ platform }: ConnectPlatformProps) {
  const [loading, setLoading] = useState(false);
  const config = PLATFORM_CONFIG[platform];

  const handleConnect = () => {
    setLoading(true);
    window.location.href = config.href;
  };

  return (
    <div className="card card-hover p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{config.icon}</span>
        <span className="font-semibold text-white">{config.label}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{config.description}</p>
      <button
        onClick={handleConnect}
        disabled={loading}
        className={`mt-auto w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r ${config.gradient} hover:opacity-90 active:scale-95 transition-all duration-150 disabled:opacity-60 shadow-lg ${config.hover} hover:shadow-lg`}
      >
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Redirecting…
          </>
        ) : (
          <>
            <ExternalLink className="w-3.5 h-3.5" />
            Connect {config.label}
          </>
        )}
      </button>
    </div>
  );
}
