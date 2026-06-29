// Olive Edge — Unified cron handler
// Dispatches on ?job= query param:
//   daily       → supply pulse          (06:00 UTC daily)
//   discovery   → autocomplete + Reddit (07:00 UTC Monday)
//   seasonality → Google Trends         (07:15 UTC Monday)

import { createClient } from '@supabase/supabase-js';
import { SEEDS, googleAutocomplete, redditBuyerDemand } from '../lib/discovery.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const commonMissing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
  if (commonMissing.length) return res.status(500).json({ error: 'missing_env_vars', missing: commonMissing });

  const { job } = req.query;
  if (job === 'daily')       return runDaily(req, res);
  if (job === 'discovery')   return runDiscovery(req, res);
  if (job === 'seasonality') return runSeasonality(req, res);
  return res.status(400).json({ error: 'unknown_job', job });
}

// ─── daily ────────────────────────────────────────────────────────────────

async function runDaily(req, res) {
  try {
    const etsyMissing = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'].filter(k => !process.env[k]);
    if (etsyMissing.length) return res.status(500).json({ error: 'missing_env_vars', missing: etsyMissing });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const today = new Date().toISOString().slice(0, 10);

    const { data: niches, error: nErr } = await supabase
      .from('niches').select('*').eq('is_active', true);
    if (nErr) return res.status(500).json({ error: 'supabase_niches', detail: nErr.message });

    const { data: doneRows } = await supabase
      .from('niche_supply_snapshots').select('niche_id').eq('snapshot_date', today);
    const done = new Set((doneRows || []).map(r => r.niche_id));
    const todo = niches.filter(n => !done.has(n.id));

    let processed = 0, failed = 0;
    const sampleError = [];

    for (let i = 0; i < todo.length; i += DAILY_CHUNK) {
      const batch = todo.slice(i, i + DAILY_CHUNK);
      await Promise.all(batch.map(async (niche) => {
        try {
          const snap = await fetchSupply(niche.keyword);
          const prior = await latestSupplyBefore(supabase, niche.id, today);
          const newCount = prior ? snap.total_listings - prior.total_listings : null;

          await supabase.from('niche_supply_snapshots').upsert({
            niche_id: niche.id,
            snapshot_date: today,
            ...snap,
            new_listings_24h: newCount,
            fetch_ok: true,
          }, { onConflict: 'niche_id,snapshot_date' });
          processed++;
        } catch (e) {
          const prior = await latestSupplyBefore(supabase, niche.id, today);
          if (prior) {
            await supabase.from('niche_supply_snapshots').upsert({
              ...prior, id: undefined, snapshot_date: today, fetch_ok: false,
            }, { onConflict: 'niche_id,snapshot_date' });
          }
          failed++;
          if (sampleError.length < 1) sampleError.push(`${niche.keyword}: ${e.message}`);
        }
      }));
    }

    for (const niche of niches) {
      await recomputeScore(supabase, niche.id, today);
    }

    return res.status(200).json({
      date: today, processed, failed, total: niches.length,
      ...(sampleError.length ? { sampleError } : {}),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: String(e.stack || '').split('\n').slice(0, 5) });
  }
}

// ─── discovery ────────────────────────────────────────────────────────────

async function runDiscovery(req, res) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Anchor to Monday so reruns on the same week are idempotent
    const today = new Date();
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    const discoveredWeek = monday.toISOString().slice(0, 10);

    // Step 1: Reddit demand signals
    const redditSignals = await redditBuyerDemand();

    // Step 2: Expand all seeds via autocomplete
    const candidateMap = new Map(); // kw -> { googlePosition, appearances, seeds }

    const autoResults = await Promise.allSettled(SEEDS.map(seed => googleAutocomplete(seed)));

    autoResults.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const seed = SEEDS[i];
      result.value.forEach(({ kw, position }) => {
        if (!kw || kw.length < 6 || kw.length > 55) return;
        const podRelevant = /mug|cup|tote|bag|print|poster|art|shirt|tee|gift|keyring|candle|planner|portrait|personalised|custom|funny|novelty/i.test(kw);
        if (!podRelevant) return;
        const existing = candidateMap.get(kw) || { googlePosition: 99, appearances: 0, seeds: [] };
        existing.googlePosition = Math.min(existing.googlePosition, position);
        existing.appearances += 1;
        existing.seeds.push(seed);
        candidateMap.set(kw, existing);
      });
    });

    // Step 3: Score candidates
    // demand_signal: 0-100 based on autocomplete strength + appearances + reddit
    //   googleStrength (0-9) × 4  = up to 36
    //   appearances (capped at 3) × 10 = up to 30
    //   redditBoost (capped at 2) × 10 = up to 20
    //   max ≈ 86; threshold 40 admits 2-seed hits at position ≤5
    const candidates = [...candidateMap.entries()].map(([kw, meta]) => {
      const redditBoost = Object.entries(redditSignals).reduce((boost, [term, mentions]) =>
        kw.toLowerCase().includes(term) ? boost + Math.min(2, mentions) : boost, 0);
      const demand_signal = Math.min(100, Math.round(
        (Math.max(0, 10 - meta.googlePosition) * 4) +
        (Math.min(meta.appearances, 3) * 10) +
        (Math.min(redditBoost, 2) * 10)
      ));
      return { kw, demand_signal, seed: meta.seeds[0], appearances: meta.appearances };
    }).filter(c => c.demand_signal >= DEMAND_THRESHOLD);

    // Step 4: Upsert into niche_candidates (idempotent on keyword+discovered_week)
    if (candidates.length) {
      await supabase.from('niche_candidates').upsert(
        candidates.map(c => ({
          keyword: c.kw,
          discovered_week: discoveredWeek,
          demand_signal: c.demand_signal,
          source: 'autocomplete',
          seed: c.seed,
          promoted: false,
        })),
        { onConflict: 'keyword,discovered_week', ignoreDuplicates: true }
      );
    }

    // Step 5: Promote top N into niches (skip keywords already in niches, active or not)
    const { data: existingNiches } = await supabase.from('niches').select('id, keyword, is_active');
    const tracked = new Set((existingNiches || []).map(n => n.keyword.toLowerCase()));
    const activeNiches = (existingNiches || []).filter(n => n.is_active);

    const toPromote = candidates
      .filter(c => !tracked.has(c.kw.toLowerCase()))
      .sort((a, b) => b.demand_signal - a.demand_signal)
      .slice(0, PROMOTION_CAP);

    let promoted = 0;
    for (const c of toPromote) {
      const { error } = await supabase.from('niches').insert({
        keyword: c.kw,
        is_active: true,
        source: 'discovered',
      });
      if (!error) {
        await supabase.from('niche_candidates')
          .update({ promoted: true })
          .eq('keyword', c.kw)
          .eq('discovered_week', discoveredWeek);
        promoted++;
      }
    }

    // Pass 2: compute and persist autocomplete + reddit signals for all active tracked niches.
    // Runs after candidate processing — redditSignals and candidateMap are already in memory.
    if (activeNiches.length) {
      const nicheAutoResults = await Promise.allSettled(
        activeNiches.map(n => googleAutocomplete(n.keyword))
      );

      const signalRows = activeNiches.map((niche, idx) => {
        const suggestions = nicheAutoResults[idx].status === 'fulfilled'
          ? nicheAutoResults[idx].value : [];
        const depth = suggestions.length; // 0-8

        // Depth contributes up to 70 pts (8 completions = keyword is actively searched)
        let autocomplete_signal = Math.round(depth / 8 * 70);

        // Position bonus (up to 30 pts) if keyword also appeared in seed-expansion this week
        const mapKey = [...candidateMap.keys()].find(
          k => k.toLowerCase() === niche.keyword.toLowerCase()
        );
        if (mapKey) {
          const meta = candidateMap.get(mapKey);
          autocomplete_signal = Math.min(100,
            autocomplete_signal + Math.max(0, 10 - meta.googlePosition) * 3
          );
        }

        // Reddit: each POD term in the keyword matched in this week's posts adds up to 20 pts
        const redditBoost = Object.entries(redditSignals).reduce((boost, [term, mentions]) =>
          niche.keyword.toLowerCase().includes(term)
            ? boost + Math.min(2, mentions) : boost, 0
        );
        const reddit_signal = Math.min(100, Math.round(redditBoost * 20));

        return {
          niche_id:            niche.id,
          snapshot_week:       discoveredWeek,
          autocomplete_signal,
          reddit_signal,
        };
      });

      // Upsert ONLY the two signal columns — demand_score and trend_direction are untouched
      await supabase.from('niche_demand_snapshots').upsert(signalRows, {
        onConflict: 'niche_id,snapshot_week',
      });
    }

    return res.status(200).json({
      week: discoveredWeek,
      seedsExpanded: SEEDS.length,
      candidatesFound: candidateMap.size,
      aboveThreshold: candidates.length,
      promoted,
      nicheSignalsWritten: activeNiches.length,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: String(e.stack || '').split('\n').slice(0, 5) });
  }
}

// ─── seasonality ──────────────────────────────────────────────────────────

async function runSeasonality(req, res) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const today = new Date();
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
    const snapshotWeek = monday.toISOString().slice(0, 10);

    const { data: niches, error: nErr } = await supabase
      .from('niches').select('id, keyword').eq('is_active', true);
    if (nErr) return res.status(500).json({ error: 'supabase_niches', detail: nErr.message });

    let processed = 0, skipped = 0;
    const sampleErrors = [];

    for (let i = 0; i < niches.length; i += SEAS_CHUNK) {
      const batch = niches.slice(i, i + SEAS_CHUNK);
      await Promise.all(batch.map(async (niche) => {
        try {
          const trends = await fetchGoogleTrends12m(niche.keyword);
          if (!trends) { skipped++; return; }

          const { monthly, weekly } = trends;

          // Compute seasonality metrics per the plan's formulas (§2)
          const sorted = [...monthly].sort((a, b) => a - b);
          const p10idx = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
          const evergreen_floor = sorted[p10idx];
          const peak_value = sorted[sorted.length - 1];
          const peak_months = monthly
            .map((v, i) => ({ v, i }))
            .filter(({ v }) => v >= 0.8 * peak_value)
            .map(({ i }) => i + 1); // 1-based: 1=Jan ... 12=Dec
          const seasonality_score = peak_value > 0
            ? +((peak_value - evergreen_floor) / peak_value).toFixed(3)
            : 0;
          const classification = seasonality_score > 0.55 ? 'seasonal' : 'evergreen';

          await supabase.from('niche_seasonality').upsert({
            niche_id: niche.id,
            classification,
            seasonality_score,
            evergreen_floor,
            peak_value,
            peak_months,
            monthly_interest: monthly,
            lead_time_weeks: 7,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'niche_id' });

          const recentAvg = avg(weekly.slice(-4).map(w => w.value));
          const priorAvg  = avg(weekly.slice(-8, -4).map(w => w.value));
          const trend_direction = recentAvg - priorAvg;

          await supabase.from('niche_demand_snapshots').upsert({
            niche_id: niche.id,
            snapshot_week: snapshotWeek,
            trend_direction,
          }, { onConflict: 'niche_id,snapshot_week' });

          processed++;
        } catch (e) {
          skipped++;
          if (sampleErrors.length < 2) sampleErrors.push(`${niche.keyword}: ${e.message}`);
        }
      }));
      // 1.5 s between batches — Trends is rate-limited and has no official SLA
      if (i + SEAS_CHUNK < niches.length) await new Promise(r => setTimeout(r, 1500));
    }

    return res.status(200).json({
      week: snapshotWeek,
      total: niches.length,
      processed,
      skipped,
      ...(sampleErrors.length ? { sampleErrors } : {}),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: String(e.stack || '').split('\n').slice(0, 5) });
  }
}

// ─── daily helpers ────────────────────────────────────────────────────────

const DAILY_CHUNK = 4;
const SAT_CAP = 1000000;
const SAT_FAV = 1000;
const TOP_N = 50;
const VALIDATION_THRESHOLD = 5;

async function fetchSupply(keyword) {
  const url = `https://openapi.etsy.com/v3/application/listings/active`
    + `?keywords=${encodeURIComponent(keyword)}&limit=${TOP_N}&sort_on=score`;
  const r = await fetch(url, { headers: { 'x-api-key': `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}` } });
  if (!r.ok) throw new Error(`etsy ${r.status}`);
  const data = await r.json();

  const top10  = (data.results || []).slice(0, 10);
  const prices = top10
    .map(l => l.price && l.price.amount / l.price.divisor)
    .filter(p => typeof p === 'number');
  const favs = top10.map(l => l.num_favorers || 0);

  return {
    total_listings: data.count ?? 0,
    avg_price:    avgRounded(prices),
    median_price: median(prices),
    min_price:    prices.length ? Math.min(...prices) : null,
    max_price:    prices.length ? Math.max(...prices) : null,
    avg_favorers: avgRounded(favs),
    top_listing_ids:    top10.map(l => String(l.listing_id)),
    top_listings_detail: top10.map(l => ({
      listing_id:    String(l.listing_id),
      title:         l.title         ?? null,
      price:         l.price ? l.price.amount / l.price.divisor : null,
      currency_code: l.price?.currency_code ?? null,
      num_favorers:  l.num_favorers  ?? 0,
      url:           l.url           ?? null,
      tags:          l.tags          ?? [],
    })),
  };
}

async function latestSupplyBefore(supabase, nicheId, date) {
  const { data } = await supabase
    .from('niche_supply_snapshots').select('*')
    .eq('niche_id', nicheId).lt('snapshot_date', date)
    .order('snapshot_date', { ascending: false }).limit(1);
  return data && data[0];
}

async function recomputeScore(supabase, nicheId, today) {
  const { data: supplyRows } = await supabase
    .from('niche_supply_snapshots').select('*')
    .eq('niche_id', nicheId).order('snapshot_date', { ascending: false }).limit(8);
  if (!supplyRows || !supplyRows.length) return;

  const latest = supplyRows[0];
  const weekAgo = supplyRows.find(r => daysBetween(r.snapshot_date, today) >= 7)
                 ?? supplyRows[supplyRows.length - 1];
  const supplyTrend7d = pct(weekAgo.total_listings, latest.total_listings);

  const { data: demandRows } = await supabase
    .from('niche_demand_snapshots').select('*')
    .eq('niche_id', nicheId).order('snapshot_week', { ascending: false }).limit(1);
  const demand = demandRows && demandRows[0];

  const { data: seasRows } = await supabase
    .from('niche_seasonality').select('*')
    .eq('niche_id', nicheId).limit(1);
  const seas = seasRows && seasRows[0];

  // Blended demand_score: favourites 45% + autocomplete 35% + reddit 20%.
  // Reweights proportionally when weekly signals are not yet available.
  const avgFav   = latest.avg_favorers ?? 0;
  const fav_norm = Math.min(100, Math.round(Math.log10(avgFav + 1) / Math.log10(201) * 100));
  const ac = demand?.autocomplete_signal ?? null;
  const rd = demand?.reddit_signal       ?? null;

  let demand_score;
  if (ac !== null && rd !== null) {
    demand_score = Math.round(0.45 * fav_norm + 0.35 * ac + 0.20 * rd);
  } else if (ac !== null) {
    demand_score = Math.round(0.5625 * fav_norm + 0.4375 * ac);  // 45/(45+35) : 35/(45+35)
  } else if (rd !== null) {
    demand_score = Math.round(0.6923 * fav_norm + 0.3077 * rd);  // 45/(45+20) : 20/(45+20)
  } else {
    demand_score = fav_norm;                                       // favourites only
  }

  // Write demand_score to the current week's snapshot row (touching only this column)
  const todayD  = new Date(today);
  const mondayD = new Date(Date.UTC(
    todayD.getUTCFullYear(), todayD.getUTCMonth(),
    todayD.getUTCDate() - ((todayD.getUTCDay() + 6) % 7)
  ));
  await supabase.from('niche_demand_snapshots').upsert({
    niche_id:      nicheId,
    snapshot_week: mondayD.toISOString().slice(0, 10),
    demand_score,
  }, { onConflict: 'niche_id,snapshot_week' });

  const crowd_norm     = clamp(Math.log10((latest.total_listings || 0) + 1) / Math.log10(SAT_CAP), 0, 1);
  const incumbent_norm = clamp(Math.log10((avgFav || 0) + 1) / Math.log10(SAT_FAV + 1), 0, 1);
  const competition    = 0.5 * crowd_norm + 0.5 * incumbent_norm;

  let gap_score = null, urgency = 'pending', validated = false;
  let classification = seas?.classification ?? null;
  let weeks_to_peak = null;

  const demandNorm = demand_score / 100;
  const base_gap   = Math.round(100 * demandNorm * (1 - competition));
  validated = demandNorm > 0.6 && avgFav > VALIDATION_THRESHOLD;

  if (seas?.classification === 'seasonal' && Array.isArray(seas.peak_months) && seas.peak_months.length) {
    const lead = seas.lead_time_weeks ?? 7;
    weeks_to_peak = calcWeeksToPeak(seas.peak_months, today);

    if (weeks_to_peak === 0)             urgency = 'peaking_now';
    else if (weeks_to_peak <= lead)      urgency = 'list_now';
    else if (weeks_to_peak <= lead + 8)  urgency = 'prepare';
    else                                 urgency = 'dormant';

    gap_score = (urgency === 'peaking_now' || urgency === 'list_now' || urgency === 'prepare')
      ? base_gap
      : Math.round(base_gap * 0.4);
  } else {
    gap_score = base_gap;
    urgency = gap_score >= 90 ? 'critical' : gap_score >= 70 ? 'high'
            : gap_score >= 40 ? 'moderate' : 'low';
  }

  const trajectory =
    (supplyTrend7d > 15) ? 'saturating'
    : (demand && demand.trend_direction > 0 && supplyTrend7d < 5) ? 'heating'
    : 'steady';

  await supabase.from('niche_scores').upsert({
    niche_id: nicheId,
    gap_score,
    demand_score,
    competition,
    urgency,
    trajectory,
    validated,
    classification,
    weeks_to_peak,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'niche_id' });
}

// Returns whole weeks from today until the start of the nearest upcoming peak month.
// 0 means we are currently inside a peak month (peaking_now).
// Once a peak month fully passes, targets next year's occurrence so the value
// cycles back up to ~52 and counts down again over the following year.
function calcWeeksToPeak(peakMonths, today) {
  const d = new Date(today);
  const year = d.getUTCFullYear();
  const todayMs = Date.UTC(year, d.getUTCMonth(), d.getUTCDate());

  let minWeeks = Infinity;
  for (const m of peakMonths) {
    const monthStartMs = Date.UTC(year, m - 1, 1); // first of month m this year
    const monthEndMs   = Date.UTC(year, m,     1); // first of month m+1 (exclusive)

    let weeks;
    if (todayMs >= monthStartMs && todayMs < monthEndMs) {
      weeks = 0; // inside this peak month right now
    } else if (todayMs < monthStartMs) {
      weeks = Math.floor((monthStartMs - todayMs) / (7 * 24 * 60 * 60 * 1000));
    } else {
      // month fully passed this year — target next year
      weeks = Math.floor((Date.UTC(year + 1, m - 1, 1) - todayMs) / (7 * 24 * 60 * 60 * 1000));
    }
    if (weeks < minWeeks) minWeeks = weeks;
  }
  return minWeeks === Infinity ? null : minWeeks;
}

// ─── seasonality helpers ──────────────────────────────────────────────────

const SEAS_CHUNK = 3;  // niches in parallel per batch; keeps Trends rate-limit headroom
const PROMOTION_CAP = 5;
const DEMAND_THRESHOLD = 40;

// Two-step Google Trends fetch: explore (get widget token) → multiline (get time series)
// Returns { monthly: number[12], weekly: {time, value}[] } or null on any failure.
async function fetchGoogleTrends12m(keyword) {
  try {
    // Step 1: get the TIMESERIES widget token
    const req1 = JSON.stringify({
      comparisonItem: [{ keyword, geo: 'GB', time: 'today 12-m' }],
      category: 0,
      property: '',
    });
    const url1 = `https://trends.google.com/trends/api/explore?hl=en&tz=0&req=${encodeURIComponent(req1)}`;
    const r1 = await fetch(url1, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r1.ok) return null;
    const text1 = await r1.text();
    const json1 = JSON.parse(text1.slice(text1.indexOf('{')));

    const widget = (json1.widgets || []).find(w => w.id === 'TIMESERIES');
    if (!widget?.token) return null;

    // Step 2: fetch the actual time-series values
    const req2 = JSON.stringify(widget.request);
    const url2 = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en&tz=0&req=${encodeURIComponent(req2)}&token=${encodeURIComponent(widget.token)}`;
    const r2 = await fetch(url2, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r2.ok) return null;
    const text2 = await r2.text();
    const json2 = JSON.parse(text2.slice(text2.indexOf('{')));

    const weekly = (json2.default?.timelineData || [])
      .filter(d => d.hasData?.[0])
      .map(d => ({ time: parseInt(d.time) * 1000, value: d.value?.[0] ?? 0 }));

    if (weekly.length < 10) return null;

    // Aggregate ~52 weekly values into 12 calendar-month buckets
    const byMonth = {};
    weekly.forEach(({ time, value }) => {
      const m = new Date(time).getUTCMonth(); // 0=Jan ... 11=Dec
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(value);
    });
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const vals = byMonth[i];
      return vals?.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    });

    return { monthly, weekly };
  } catch (e) { return null; }
}

// ─── math helpers ─────────────────────────────────────────────────────────

// Returns 2dp-rounded number or null — used by fetchSupply (daily)
const avgRounded = a => a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : null;
// Returns plain float or 0 — used by trend_direction calc (seasonality)
const avg        = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const median = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2);
};
const clamp      = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct        = (from, to)  => (from ? ((to - from) / from) * 100 : 0);
const daysBetween = (a, b)     => Math.abs((new Date(b) - new Date(a)) / 86400000);
