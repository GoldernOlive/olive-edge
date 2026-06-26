-- Olive Edge — Schema v2 additions
-- Run in the Supabase SQL editor. All statements are idempotent.

-- Discovered-but-not-yet-tracked keywords
create table if not exists niche_candidates (
  id              uuid primary key default gen_random_uuid(),
  keyword         text not null,
  discovered_week date not null,
  demand_signal   numeric,
  source          text,         -- 'autocomplete' | 'reddit'
  seed            text,         -- which seed produced it
  promoted        boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (keyword, discovered_week)
);

-- Slowly-changing seasonal profile, recomputed weekly
create table if not exists niche_seasonality (
  niche_id          uuid primary key references niches(id) on delete cascade,
  classification    text,         -- 'evergreen' | 'seasonal'
  seasonality_score numeric,      -- 0..1
  evergreen_floor   numeric,      -- 0..100 relative
  peak_value        numeric,
  peak_months       jsonb,        -- [11, 12] = Nov, Dec (1-based)
  monthly_interest  jsonb,        -- 12-element array for charting
  lead_time_weeks   int default 7,
  updated_at        timestamptz not null default now()
);

-- Guard: ensure niche_demand_snapshots has a unique constraint for upserts
create unique index if not exists niche_demand_snapshots_niche_week_uidx
  on niche_demand_snapshots (niche_id, snapshot_week);

-- Track provenance of niches ('seed' | 'discovered')
alter table niches add column if not exists source text default 'seed';

-- Price + favourites pairs for the winning-price chart (populated in daily step 5)
alter table niche_supply_snapshots
  add column if not exists top_listings_detail jsonb;

-- Surface classification + season-aware fields on the score row
alter table niche_scores add column if not exists classification text;
alter table niche_scores add column if not exists weeks_to_peak int;
