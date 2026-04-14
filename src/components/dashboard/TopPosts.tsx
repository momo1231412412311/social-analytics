import Image from 'next/image';
import { ExternalLink, Play, Image as ImageIcon, LayoutGrid, MessageSquare } from 'lucide-react';
import type { PostData, ContentType } from '@/lib/types';

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const typeIcon: Record<ContentType, React.ReactNode> = {
  short:    <Play className="w-3 h-3 fill-white" />,
  video:    <Play className="w-3 h-3 fill-white" />,
  photo:    <ImageIcon className="w-3 h-3" />,
  carousel: <LayoutGrid className="w-3 h-3" />,
  tweet:    <MessageSquare className="w-3 h-3" />,
  live:     <span className="text-[9px] font-bold">LIVE</span>,
  unknown:  null,
};

function engColor(rate: number) {
  if (rate >= 5)  return 'text-emerald-400';
  if (rate >= 2)  return 'text-yellow-400';
  return 'text-zinc-400';
}

export default function TopPosts({ posts }: { posts: PostData[] }) {
  const top10 = posts.slice(0, 10);
  if (top10.length === 0) return <p className="text-sm text-zinc-500 py-6 text-center">No posts found.</p>;

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[2rem_3rem_1fr_5rem_5rem_5rem_5rem_5rem] gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
        <span>#</span>
        <span />
        <span>Post</span>
        <span className="text-right">Views</span>
        <span className="text-right">Likes</span>
        <span className="text-right">Comments</span>
        <span className="text-right">Eng %</span>
        <span className="text-right">Date</span>
      </div>

      {top10.map((post, i) => (
        <a
          key={post.id}
          href={post.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="grid grid-cols-[2rem_3rem_1fr_5rem_5rem_5rem_5rem_5rem] gap-3 px-3 py-2 rounded-lg items-center hover:bg-zinc-800/60 transition-colors group"
        >
          {/* Rank */}
          <span className={`text-sm font-bold tabular-nums ${
            i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-600'
          }`}>
            {i + 1}
          </span>

          {/* Thumbnail */}
          <div className="relative w-12 h-8 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
            {post.thumbnail_url ? (
              <Image
                src={post.thumbnail_url}
                alt=""
                fill
                className="object-cover"
                sizes="48px"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                {typeIcon[post.content_type] ?? typeIcon.unknown}
              </div>
            )}
            <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded p-0.5 text-white">
              {typeIcon[post.content_type]}
            </div>
          </div>

          {/* Title */}
          <div className="min-w-0">
            <p className="text-xs text-zinc-200 truncate group-hover:text-white transition-colors">
              {post.title || '(no caption)'}
            </p>
          </div>

          {/* Stats */}
          <span className="text-xs text-zinc-300 tabular-nums text-right font-medium">{fmt(post.views)}</span>
          <span className="text-xs text-zinc-400 tabular-nums text-right">{fmt(post.likes)}</span>
          <span className="text-xs text-zinc-400 tabular-nums text-right">{fmt(post.comments)}</span>
          <span className={`text-xs tabular-nums text-right font-semibold ${engColor(post.engagement_rate)}`}>
            {post.engagement_rate.toFixed(2)}%
          </span>
          <span className="text-xs text-zinc-500 tabular-nums text-right">
            {new Date(post.published_at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })}
          </span>
        </a>
      ))}
    </div>
  );
}
