import Image from 'next/image';
import { Heart, MessageCircle, Eye, Share2, Play } from 'lucide-react';

interface Post {
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
  engagement_rate: number;
  watch_time_minutes: number;
}

interface TopPostsProps {
  posts: Post[];
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

const platformColors: Record<string, string> = {
  instagram: 'bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500',
  tiktok:    'bg-gradient-to-br from-zinc-900 to-pink-800',
  youtube:   'bg-gradient-to-br from-red-800 to-red-600',
};

const platformEmoji: Record<string, string> = {
  instagram: '📷',
  tiktok:    '🎵',
  youtube:   '▶️',
};

export default function TopPosts({ posts }: TopPostsProps) {
  if (posts.length === 0) {
    return (
      <p className="text-sm text-zinc-500 text-center py-8">
        No posts found. Sync to fetch your content.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {posts.map((post) => (
        <a
          key={`${post.platform}-${post.post_id}`}
          href={post.post_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 hover:border-zinc-500 transition-all duration-200 card-hover"
        >
          {/* Thumbnail */}
          <div className="aspect-square relative">
            {post.thumbnail_url ? (
              <Image
                src={post.thumbnail_url}
                alt={post.title ?? post.caption ?? 'Post'}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                unoptimized
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center ${platformColors[post.platform] ?? 'bg-zinc-700'}`}>
                <span className="text-3xl">{platformEmoji[post.platform] ?? '📄'}</span>
              </div>
            )}

            {/* Video indicator */}
            {(post.media_type === 'VIDEO' || post.media_type === 'REELS') && (
              <div className="absolute top-1.5 right-1.5 bg-black/60 rounded p-0.5">
                <Play className="w-3 h-3 text-white fill-white" />
              </div>
            )}

            {/* Platform badge */}
            <div className="absolute top-1.5 left-1.5 text-xs">
              {platformEmoji[post.platform]}
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-200 flex items-end">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-full p-2 space-y-1">
                {post.caption && (
                  <p className="text-[10px] text-zinc-200 line-clamp-2 leading-tight">
                    {post.caption}
                  </p>
                )}
                {post.title && !post.caption && (
                  <p className="text-[10px] text-zinc-200 line-clamp-2 leading-tight">
                    {post.title}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-emerald-400">
                {post.engagement_rate.toFixed(1)}% eng
              </span>
              {post.published_at && (
                <span className="text-[10px] text-zinc-500">
                  {new Date(post.published_at * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {post.views > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Eye className="w-2.5 h-2.5" />
                  <span>{fmt(post.views)}</span>
                </div>
              )}
              {post.likes > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Heart className="w-2.5 h-2.5" />
                  <span>{fmt(post.likes)}</span>
                </div>
              )}
              {post.comments > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <MessageCircle className="w-2.5 h-2.5" />
                  <span>{fmt(post.comments)}</span>
                </div>
              )}
              {post.shares > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Share2 className="w-2.5 h-2.5" />
                  <span>{fmt(post.shares)}</span>
                </div>
              )}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
