export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'twitter';

export type ContentType =
  | 'short'     // YouTube Shorts / TikTok / IG Reels
  | 'video'     // Regular video
  | 'photo'     // Instagram photo / tweet with image
  | 'carousel'  // Instagram carousel
  | 'tweet'     // Plain text tweet
  | 'live'      // Live stream
  | 'unknown';

export interface PostData {
  id: string;
  title: string;
  thumbnail_url: string;
  post_url: string;
  published_at: string;       // ISO date string
  views: number;
  likes: number;
  comments: number;
  shares: number;
  duration_seconds: number;   // 0 for photos/tweets
  content_type: ContentType;
  engagement_rate: number;    // (likes+comments) / views * 100
}

export interface ProfileData {
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  followers: number;
  following: number;
  post_count: number;
  total_likes: number;        // TikTok heart count or IG total likes
  verified: boolean;
  profile_url: string;
}

export interface AnalyticsSummary {
  avg_views: number;
  avg_likes: number;
  avg_comments: number;
  avg_engagement_rate: number;
  total_views: number;
  posting_frequency_per_week: number;
  best_content_type: ContentType;
  top_content_types: Array<{ type: ContentType; avg_views: number; count: number }>;
}

export interface AnalyticsResult {
  platform: Platform;
  handle: string;
  profile: ProfileData;
  summary: AnalyticsSummary;
  posts: PostData[];           // All fetched posts, sorted by views desc
  fetched_at: number;         // Unix timestamp
  from_cache?: boolean;
  limited_data?: boolean;     // True when only meta-tag data available (no posts)
}
