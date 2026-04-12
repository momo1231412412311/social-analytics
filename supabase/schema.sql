-- ============================================================
--  Social Analytics Dashboard — Supabase Schema
--
--  Run this in your Supabase project:
--  Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- ── Platform connections ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_connections (
  id               SERIAL         PRIMARY KEY,
  platform         TEXT           NOT NULL UNIQUE,
  access_token     TEXT           NOT NULL,
  refresh_token    TEXT,
  token_expires_at BIGINT,
  user_id          TEXT,
  username         TEXT,
  avatar_url       TEXT,
  last_synced_at   BIGINT,
  created_at       BIGINT         NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

-- ── Daily metrics ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_metrics (
  id                   SERIAL           PRIMARY KEY,
  platform             TEXT             NOT NULL,
  date                 TEXT             NOT NULL,  -- 'YYYY-MM-DD'
  reach                INTEGER          NOT NULL DEFAULT 0,
  impressions          INTEGER          NOT NULL DEFAULT 0,
  followers            INTEGER          NOT NULL DEFAULT 0,
  engagement_rate      DOUBLE PRECISION NOT NULL DEFAULT 0,
  watch_time_minutes   INTEGER          NOT NULL DEFAULT 0,
  likes                INTEGER          NOT NULL DEFAULT 0,
  comments             INTEGER          NOT NULL DEFAULT 0,
  shares               INTEGER          NOT NULL DEFAULT 0,
  views                INTEGER          NOT NULL DEFAULT 0,
  saves                INTEGER          NOT NULL DEFAULT 0,
  UNIQUE (platform, date)
);

-- ── Posts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id                   SERIAL           PRIMARY KEY,
  platform             TEXT             NOT NULL,
  post_id              TEXT             NOT NULL,
  title                TEXT,
  caption              TEXT,
  thumbnail_url        TEXT,
  post_url             TEXT,
  media_type           TEXT,
  published_at         BIGINT,
  likes                INTEGER          NOT NULL DEFAULT 0,
  comments             INTEGER          NOT NULL DEFAULT 0,
  shares               INTEGER          NOT NULL DEFAULT 0,
  views                INTEGER          NOT NULL DEFAULT 0,
  reach                INTEGER          NOT NULL DEFAULT 0,
  impressions          INTEGER          NOT NULL DEFAULT 0,
  engagement_rate      DOUBLE PRECISION NOT NULL DEFAULT 0,
  watch_time_minutes   INTEGER          NOT NULL DEFAULT 0,
  saves                INTEGER          NOT NULL DEFAULT 0,
  fetched_at           BIGINT           NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
  UNIQUE (platform, post_id)
);

-- ── Audience demographics ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS audience_demographics (
  id         SERIAL           PRIMARY KEY,
  platform   TEXT             NOT NULL,
  date       TEXT             NOT NULL,  -- 'YYYY-MM-DD'
  dimension  TEXT             NOT NULL,
  label      TEXT             NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  UNIQUE (platform, date, dimension, label)
);

-- ── Posting time stats ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posting_time_stats (
  id               SERIAL           PRIMARY KEY,
  platform         TEXT             NOT NULL,
  day_of_week      INTEGER          NOT NULL,  -- 0=Sun … 6=Sat
  hour_of_day      INTEGER          NOT NULL,  -- 0–23
  total_engagement DOUBLE PRECISION NOT NULL DEFAULT 0,
  post_count       INTEGER          NOT NULL DEFAULT 0,
  avg_engagement   DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (platform, day_of_week, hour_of_day)
);

-- ── Stored procedures ─────────────────────────────────────────

-- Merge-upsert daily metrics (preserves existing values for nulls)
CREATE OR REPLACE FUNCTION upsert_daily_metric(
  p_platform           TEXT,
  p_date               TEXT,
  p_reach              INTEGER          DEFAULT NULL,
  p_impressions        INTEGER          DEFAULT NULL,
  p_followers          INTEGER          DEFAULT NULL,
  p_engagement_rate    DOUBLE PRECISION DEFAULT NULL,
  p_watch_time_minutes INTEGER          DEFAULT NULL,
  p_likes              INTEGER          DEFAULT NULL,
  p_comments           INTEGER          DEFAULT NULL,
  p_shares             INTEGER          DEFAULT NULL,
  p_views              INTEGER          DEFAULT NULL,
  p_saves              INTEGER          DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO daily_metrics (
    platform, date, reach, impressions, followers, engagement_rate,
    watch_time_minutes, likes, comments, shares, views, saves
  ) VALUES (
    p_platform, p_date,
    COALESCE(p_reach, 0),
    COALESCE(p_impressions, 0),
    COALESCE(p_followers, 0),
    COALESCE(p_engagement_rate, 0),
    COALESCE(p_watch_time_minutes, 0),
    COALESCE(p_likes, 0),
    COALESCE(p_comments, 0),
    COALESCE(p_shares, 0),
    COALESCE(p_views, 0),
    COALESCE(p_saves, 0)
  )
  ON CONFLICT (platform, date) DO UPDATE SET
    reach               = CASE WHEN p_reach               IS NOT NULL THEN p_reach               ELSE daily_metrics.reach               END,
    impressions         = CASE WHEN p_impressions         IS NOT NULL THEN p_impressions         ELSE daily_metrics.impressions         END,
    followers           = CASE WHEN p_followers           IS NOT NULL THEN p_followers           ELSE daily_metrics.followers           END,
    engagement_rate     = CASE WHEN p_engagement_rate     IS NOT NULL THEN p_engagement_rate     ELSE daily_metrics.engagement_rate     END,
    watch_time_minutes  = CASE WHEN p_watch_time_minutes  IS NOT NULL THEN p_watch_time_minutes  ELSE daily_metrics.watch_time_minutes  END,
    likes               = CASE WHEN p_likes               IS NOT NULL THEN p_likes               ELSE daily_metrics.likes               END,
    comments            = CASE WHEN p_comments            IS NOT NULL THEN p_comments            ELSE daily_metrics.comments            END,
    shares              = CASE WHEN p_shares              IS NOT NULL THEN p_shares              ELSE daily_metrics.shares              END,
    views               = CASE WHEN p_views               IS NOT NULL THEN p_views               ELSE daily_metrics.views               END,
    saves               = CASE WHEN p_saves               IS NOT NULL THEN p_saves               ELSE daily_metrics.saves               END;
END;
$$;

-- Accumulate posting time engagement (running average)
CREATE OR REPLACE FUNCTION upsert_posting_time_stat(
  p_platform    TEXT,
  p_day_of_week INTEGER,
  p_hour_of_day INTEGER,
  p_engagement  DOUBLE PRECISION
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO posting_time_stats (platform, day_of_week, hour_of_day, total_engagement, post_count, avg_engagement)
  VALUES (p_platform, p_day_of_week, p_hour_of_day, p_engagement, 1, p_engagement)
  ON CONFLICT (platform, day_of_week, hour_of_day) DO UPDATE SET
    total_engagement = posting_time_stats.total_engagement + p_engagement,
    post_count       = posting_time_stats.post_count + 1,
    avg_engagement   = (posting_time_stats.total_engagement + p_engagement)
                       / (posting_time_stats.post_count + 1);
END;
$$;
