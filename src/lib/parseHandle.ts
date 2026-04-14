import type { Platform } from './types';

export interface ParsedHandle {
  handle: string;             // normalized — no @, lowercase
  cacheKey: string;           // platform:handle
  ytResolutionHint?: 'id' | 'forHandle' | 'forUsername' | 'search';
}

/** Strip leading @ and any trailing slash; lowercase */
function clean(s: string): string {
  return s.replace(/^@/, '').replace(/\/$/, '').trim().toLowerCase();
}

function parseYouTubeUrl(url: URL): ParsedHandle {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'channel' && parts[1]) {
    const id = parts[1];
    return { handle: id, cacheKey: `youtube:${id}`, ytResolutionHint: 'id' };
  }
  if (parts[0]?.startsWith('@')) {
    const h = clean(parts[0]);
    return { handle: h, cacheKey: `youtube:${h}`, ytResolutionHint: 'forHandle' };
  }
  if (parts[0] === 'user' && parts[1]) {
    const h = clean(parts[1]);
    return { handle: h, cacheKey: `youtube:${h}`, ytResolutionHint: 'forUsername' };
  }
  const h = clean(parts[parts.length - 1] ?? '');
  return { handle: h, cacheKey: `youtube:${h}`, ytResolutionHint: 'search' };
}

export function parseHandle(input: string, platform: Platform): ParsedHandle {
  const trimmed = input.trim();

  let url: URL | null = null;
  const looksLikeUrl =
    trimmed.startsWith('http') ||
    (trimmed.includes('.') && !trimmed.startsWith('@'));
  if (looksLikeUrl) {
    try {
      url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    } catch {
      // not a URL
    }
  }

  if (url) {
    const host = url.hostname.replace(/^www\./, '');

    if (platform === 'youtube' || host.includes('youtube') || host.includes('youtu.be')) {
      return parseYouTubeUrl(url);
    }

    if (platform === 'instagram' || host.includes('instagram')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const h = clean(parts[0] ?? '');
      return { handle: h, cacheKey: `instagram:${h}` };
    }

    if (platform === 'tiktok' || host.includes('tiktok')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const h = clean(parts[0] ?? '');
      return { handle: h, cacheKey: `tiktok:${h}` };
    }

    // Twitter / X URLs: x.com/username or twitter.com/username
    if (platform === 'twitter' || host.includes('twitter') || host === 'x.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      // Skip /i/, /home, /settings, /status etc. — just grab first path segment
      const h = clean(parts[0] ?? '');
      return { handle: h, cacheKey: `twitter:${h}` };
    }
  }

  // Plain handle / @handle
  const h = clean(trimmed);

  if (platform === 'youtube') {
    const hint = /^uc[a-z0-9_-]{20,}$/i.test(h) ? 'id' : 'forHandle';
    return { handle: h, cacheKey: `youtube:${h}`, ytResolutionHint: hint };
  }

  return { handle: h, cacheKey: `${platform}:${h}` };
}
