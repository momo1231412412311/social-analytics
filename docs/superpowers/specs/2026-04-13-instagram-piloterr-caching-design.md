# Instagram: Piloterr API + Meta-Tag Fallback + 24h Cache

**Date:** 2026-04-13  
**Status:** Approved  

## Problem

Instagram's internal JSON API (`/api/v1/users/web_profile_info/`) and HTML scraping
strategies are both being rate-limited or blocked at the server IP level (Netlify edge
functions). The result is a "rate limit reached" error on every Instagram search.

## Goals

1. Replace blocked scraping with a reliable data source that returns profile + post data.
2. Keep a zero-config fallback (no API key required) that returns at least profile data.
3. Extend Instagram's Supabase cache TTL to 24 hours (other platforms stay at 6 hours)
   so each unique profile costs at most one external API call per day.

## Approach

**Primary:** Piloterr REST API — single synchronous HTTP call, returns profile + ~12
recent posts in a shape compatible with the existing `mapProfile` / `mapNode` helpers.
Requires `PILOTERR_API_KEY` env var.

**Fallback:** Parse `og:` meta tags from the public Instagram profile page — extracts
display name, avatar, and follower/following/post counts from `og:description` regex.
Returns a profile-only result (`posts: []`). No API key required, always available for
public profiles.

## Data Flow

```
GET /api/analyze?platform=instagram&handle={h}
  → route.ts
  → getCached(cacheKey, 'instagram')   [24h TTL]
       hit → return cached result
       miss → fetchInstagram(handle)
                → fetchViaPiloterr()        primary
                    throws (no key / API error)
                → fetchViaMetaTags()        fallback
  → mapProfile() + mapNode()              existing helpers, unchanged
  → setCached(cacheKey, result, 'instagram')
  → return JSON
```

## Component Changes

### `src/lib/platforms/instagram.ts`

- **Remove:** `fetchViaJsonApi`, `fetchViaHtml`, `findUserInObject`, `FETCH_HEADERS`,
  `IG_APP_ID` — all scraping infrastructure.
- **Remove:** `import { load } from 'cheerio'` — no longer needed.
- **Add:** `fetchViaPiloterr(handle)` — calls
  `GET https://api.piloterr.com/api/v2/instagram/user/info?query={handle}`
  with header `x-api-key: PILOTERR_API_KEY`. Extracts `data.user` for `mapProfile`
  and `data.user.edge_owner_to_timeline_media.edges[].node` for `mapNode`. Throws on
  missing key, non-200 status, or missing user in response.
- **Add:** `fetchViaMetaTags(handle)` — fetches
  `https://www.instagram.com/{handle}/` with a browser User-Agent, reads raw HTML
  (no DOM library), extracts:
  - `og:title` → display name (strips " • Instagram photos and videos")
  - `og:image` → avatar URL
  - `og:description` → regex for follower/following/post counts
  Returns an `AnalyticsResult` with `posts: []`. Adds an optional
  `limited_data?: true` field to `AnalyticsResult` (parallel to `from_cache`)
  so the UI can show a "Limited data — add PILOTERR_API_KEY" banner.
- **Update:** `fetchInstagram` — tries `fetchViaPiloterr`, on any error falls through
  to `fetchViaMetaTags`. If meta tags can't extract a username, throws
  "Instagram profile not found or private."

### `src/lib/db.ts`

- **Add:** `const PLATFORM_TTL: Record<string, number> = { instagram: 86400 }` and
  `const DEFAULT_TTL = 21600`.
- **Update:** `getCached(cacheKey, platform?)` and `setCached(cacheKey, result, platform?)`
  accept an optional `platform` string and use `PLATFORM_TTL[platform] ?? DEFAULT_TTL`
  for the TTL comparison / no change to the Supabase schema.

### `src/lib/types.ts`

- **Add:** `limited_data?: true` to `AnalyticsResult` (optional, parallel to `from_cache`).

### `src/app/api/analyze/route.ts`

- Pass `platform` to `getCached` and `setCached` calls so db.ts picks the right TTL.

### `.env.local.example`

- Add `PILOTERR_API_KEY=your-piloterr-api-key-here` under the Instagram section with
  a note linking to `https://piloterr.com`.

## Error Handling

| Condition | Behaviour |
|---|---|
| `PILOTERR_API_KEY` not set | Silently fall through to meta tags |
| Piloterr 429 or 5xx | Silently fall through to meta tags |
| Meta tags: profile is private / not found | Throw "Instagram profile not found or private." |
| Meta tags available, posts absent | Return profile card with `limited_data: true`; UI shows "add API key" banner |
| Cache write failure | Fire-and-forget `console.error` (existing behaviour, unchanged) |

## What Does NOT Change

- `mapProfile` and `mapNode` helper functions — Piloterr returns the same
  `edge_followed_by` / `edge_owner_to_timeline_media` shape.
- YouTube and TikTok fetch logic.
- Supabase schema — no migrations needed.
- Cache TTL for YouTube and TikTok (stays 6 hours).
- `cheerio` package — left in `package.json` (removing it is out of scope).

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `PILOTERR_API_KEY` | No (degrades gracefully) | Piloterr Instagram API access |
| `SUPABASE_URL` | Yes | Cache storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Cache storage |
