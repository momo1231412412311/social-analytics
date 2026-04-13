-- ============================================================
--  Rival — Competitor Analytics Dashboard
--  Supabase schema (run in SQL Editor → New query → Run)
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_cache (
  id         SERIAL    PRIMARY KEY,
  platform   TEXT      NOT NULL,
  handle     TEXT      NOT NULL,  -- normalized: lowercase, no @
  data       JSONB     NOT NULL,
  fetched_at BIGINT    NOT NULL,
  UNIQUE (platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_analytics_cache_lookup
  ON analytics_cache (platform, handle);

CREATE INDEX IF NOT EXISTS idx_analytics_cache_recent
  ON analytics_cache (fetched_at DESC);
