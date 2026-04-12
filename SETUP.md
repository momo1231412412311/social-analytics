# Social Analytics Dashboard — Setup

## 1. Fill in `.env.local`

Copy the template and fill in your API credentials:

```bash
cp .env.local.example .env.local
```

### Instagram (Meta Graph API)
1. Go to https://developers.facebook.com/ → Create App → **Business** type
2. Add products: **Instagram Graph API** + **Facebook Login**
3. In Facebook Login → Settings → Valid OAuth Redirect URIs, add:
   `http://localhost:3000/api/auth/instagram/callback`
4. Required permissions: `instagram_basic`, `instagram_manage_insights`,
   `pages_show_list`, `pages_read_engagement`
5. Your Instagram account must be a **Business or Creator** account linked to a Facebook Page
6. Copy App ID → `INSTAGRAM_APP_ID`, App Secret → `INSTAGRAM_APP_SECRET`

### TikTok for Business
1. Go to https://developers.tiktok.com/ → Create App
2. Add **Login Kit** product
3. Add redirect URI: `http://localhost:3000/api/auth/tiktok/callback`
4. Required scopes: `user.info.basic`, `video.list`
5. Copy Client Key → `TIKTOK_CLIENT_KEY`, Client Secret → `TIKTOK_CLIENT_SECRET`

### YouTube (Google Cloud Console)
1. Go to https://console.cloud.google.com/
2. Create a project → Enable **YouTube Data API v3** and **YouTube Analytics API**
3. Create OAuth 2.0 credentials → Web application
4. Add authorized redirect URI: `http://localhost:3000/api/auth/youtube/callback`
5. Copy Client ID → `YOUTUBE_CLIENT_ID`, Client Secret → `YOUTUBE_CLIENT_SECRET`

### Secret key
Generate a random 32-character string for `NEXTAUTH_SECRET`:
```bash
openssl rand -hex 16
```

## 2. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000

## 3. Connect accounts

- Click **Connect Instagram / TikTok / YouTube** for each platform
- You'll be redirected to the platform's OAuth screen
- After authorizing, you'll be returned to the dashboard
- An initial data sync starts automatically

## 4. Data refresh

- Data syncs automatically every 24 hours when you visit the dashboard
- Click **Sync** in the top-right to force a refresh
- Data is stored in `data/analytics.db` (SQLite)

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (dark mode)
- **Recharts** for charts
- **better-sqlite3** for local SQLite storage
- OAuth 2.0 for Instagram (Meta), TikTok, YouTube (Google)
