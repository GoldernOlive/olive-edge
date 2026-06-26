// Olive Edge — Daily Supply Pulse  (diagnostic build)
// Path in your repo: /api/cron/daily-supply.js
//
// This version surfaces the real error in the response instead of a generic
// FUNCTION_INVOCATION_FAILED, so the curl output tells us exactly what's wrong.
//
// Env vars (already in Vercel):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ETSY_API_KEY, CRON_SECRET

import { createClient } from '@supabase/supabase-js';

const SAT_CAP = 10000;
const TOP_N = 50;
const CHUNK = 4;
const VALIDATION_THRESHOLD = 5;

export default async function handler(req, res) {
  try {
    // --- auth -------------------------------------------------------------
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    // --- env var sanity check (returns clearly if any are missing) --------
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ETSY_API_KEY'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
      return res.status(500).json({ error: 'missing_env_vars', missing });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

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

    for (let i = 0; i < todo.length; i += CHUNK) {
      const batch = todo.slice(i, i + CHUNK);
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
    // the catch-all that turns a crash into a readable message
    return res.status(500).json({
      error: e.message,
      stack: String(e.stack || '').split('\n').slice(0, 5),
    });
  }
}

async function fetchSupply(keyword) {
  const url = `https://openapi.etsy.com/v3/application/listings/active`
    + `?keywords=${encodeURIComponent(keyword)}&limit=${TOP_N}&sort_on=score`;
  const r = await fetch(url, { headers: { 'x-api-key': process.env.ETSY_API_KEY } });
  if (!r.ok) throw new Error(`etsy ${r.status}`);
  const data = await r.json();

  const prices = (data.results || [])
    .map(l => l.price && l.price.amount / l.price.divisor)
    .filter(p => typeof p === 'number');
  const favs = (data.results || []).map(l => l.num_favorers || 0);

  return {
    total_listings: data.count ?? 0,
    avg_price:    avg(prices),
    median_price: median(prices),
    min_price:    prices.length ? Math.min(...prices) : null,
    max_price:    prices.length ? Math.max(...prices) : null,
    avg_favorers: avg(favs),
    top_listing_ids: (data.results || []).slice(0, 10).map(l => String(l.listing_id)),
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

  const competition = clamp(
    Math.log10((latest.total_listings || 0) + 1) / Math.log10(SAT_CAP), 0, 1);

  let gap_score = null, urgency = 'pending', validated = false;
  if (demand && typeof demand.demand_score === 'number') {
    const demandNorm = demand.demand_score / 100;
    gap_score = Math.round(100 * demandNorm * (1 - competition));
    urgency = gap_score >= 90 ? 'critical' : gap_score >= 70 ? 'high'
            : gap_score >= 40 ? 'moderate' : 'low';
    validated = demandNorm > 0.6 && (latest.avg_favorers || 0) > VALIDATION_THRESHOLD;
  }

  const trajectory =
    (supplyTrend7d > 15) ? 'saturating'
    : (demand && demand.trend_direction > 0 && supplyTrend7d < 5) ? 'heating'
    : 'steady';

  await supabase.from('niche_scores').upsert({
    niche_id: nicheId,
    gap_score,
    demand_score: demand ? demand.demand_score : null,
    competition,
    urgency,
    trajectory,
    validated,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'niche_id' });
}

const avg = a => a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2) : null;
const median = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2);
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct = (from, to) => (from ? ((to - from) / from) * 100 : 0);
const daysBetween = (a, b) => Math.abs((new Date(b) - new Date(a)) / 86400000);
