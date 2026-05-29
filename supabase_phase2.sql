-- ============================================
-- OLIVE EDGE — Phase 2/3/4 Database Tables
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. KEYWORD SNAPSHOTS — daily tracking for velocity charts
-- This is the data backbone. Every search stores a snapshot.
-- Over 30/60/90 days you can see if a niche is growing or saturating.
CREATE TABLE IF NOT EXISTS keyword_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  listing_count integer DEFAULT 0,
  avg_price numeric(10,2),
  top_tags jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(keyword, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_keyword_snapshots_keyword ON keyword_snapshots(keyword);
CREATE INDEX IF NOT EXISTS idx_keyword_snapshots_date ON keyword_snapshots(snapshot_date);

-- No RLS needed — public read, API writes via service key


-- 2. KEYWORD ALERTS — users watch keywords, get notified on spikes
CREATE TABLE IF NOT EXISTS keyword_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  email text,
  alert_type text DEFAULT 'spike',
  active boolean DEFAULT true,
  last_triggered timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE keyword_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alerts"
ON keyword_alerts FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_keyword_alerts_user ON keyword_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_keyword_alerts_keyword ON keyword_alerts(keyword);


-- 3. PRICE HISTORY — track average prices over time per keyword
-- Lets you see if a market is racing to the bottom or holding value
CREATE TABLE IF NOT EXISTS price_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  avg_price numeric(10,2),
  min_price numeric(10,2),
  max_price numeric(10,2),
  median_price numeric(10,2),
  sample_count integer DEFAULT 0,
  UNIQUE(keyword, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_price_history_keyword ON price_history(keyword);


-- 4. SEARCH LOG — track what's being searched (anonymised)
-- Tells you what your users actually care about
-- Great for finding new niches to feature on the dashboard
CREATE TABLE IF NOT EXISTS search_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text NOT NULL,
  searched_at timestamptz DEFAULT now(),
  result_count integer,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_search_log_keyword ON search_log(keyword);
CREATE INDEX IF NOT EXISTS idx_search_log_date ON search_log(searched_at);

-- View: most searched keywords this week
CREATE OR REPLACE VIEW trending_searches AS
SELECT 
  keyword,
  COUNT(*) as search_count,
  MAX(searched_at) as last_searched
FROM search_log
WHERE searched_at >= NOW() - INTERVAL '7 days'
GROUP BY keyword
ORDER BY search_count DESC
LIMIT 50;


-- ============================================
-- DONE. Go back to the app and start searching.
-- Every search now builds the velocity database.
-- ============================================
