-- Olive Edge — Schema v3 additions
-- Run in the Supabase SQL editor. Both statements are idempotent.

-- Per-niche weekly signals written by the discovery job.
-- demand_score (written by the daily job) blends these with fresh Etsy favourites.
alter table niche_demand_snapshots
  add column if not exists autocomplete_signal numeric;

alter table niche_demand_snapshots
  add column if not exists reddit_signal numeric;
