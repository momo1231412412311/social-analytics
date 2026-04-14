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
  // youtube.com/channel/UCxxxxxxx
  if (parts[0] === 'channel' && parts[1]) {
    const id = parts[1];
    return { handle: id, cacheKey: `youtube:${id}`, ytResolutionHint: 'id' };
  }
  // youtube.com/@handle
  if (parts[0]?.startsWith('@')) {
    const h = clean(parts[0]);
    return { handle: h, cacheKey: `youtube:${h}`, ytResolutionHint: 'forHandle' };
  }
  // youtube.com/user/username (legacy)
  if (parts[0] === 'user' && parts[1]) {
    const h = clean(parts[1]);
    return { handle: h, cacheKey: `youtube:${h}`, ytResolutionHint: 'forUsername' };
  }
  // youtube.com/c/name or youtube.com/name (custom URL)
  const h = clean(parts[parts.length - 1] ?? '');
  return { handle: h, cacheKey: `youtube:${h}`, ytResolutionHint: 'search' };
}

export function parseHandle(input: string, platform: Platform): ParsedHandle {
  const trimmed = input.trim();

  // Try to parse as URL only if input looks like one (has a dot or starts with http).
  // Plain handles like "@username" or "username" must NOT be parsed as URLs because
  // new URL("https://@username") succeeds but yields an empty pathname, causing the
  // extracted handle to be "" and the downstream API call to send username= (empty).
  let url: URL | null = null;
  const looksLikeUrl = trimmed.startsWith('http') ||
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
  }

  // Plain handle / @handle
  const h = clean(trimmed);

  if (platform === 'youtube') {
    // UC... looks like a channel ID
    const hint = /^uc[a-z0-9_-]{20,}$/i.test(h) ? 'id' : 'forHandle';
    return { handle: h, cacheKey: `youtube:${h}`, ytResolutionHint: hint };
  }

  return { handle: h, cacheKey: `${platform}:${h}` };
}
