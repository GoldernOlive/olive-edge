// Olive Edge — Weekly Seasonality Cron (Phase B)
// Schedule: 15 7 * * 1 (Monday 07:15 UTC)
// Per tracked niche: 12-month Google Trends → niche_seasonality + niche_demand_snapshots

import { createClient } from '@supabase/supabase-js';

const CHUNK = 3;  // niches processed in parallel per batch; keeps Trends rate-limit headroom

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) return res.status(500).json({ error: 'missing_env_vars', missing });

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

    for (let i = 0; i < niches.length; i += CHUNK) {
      const batch = niches.slice(i, i + CHUNK);
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

          // demand_score drives gap_score in the daily fusion step:
          //   evergreen → use the sustained floor; seasonal → use the peak potential
          const demand_score = classification === 'evergreen' ? evergreen_floor : peak_value;
          const recentAvg = avg(weekly.slice(-4).map(w => w.value));
          const priorAvg  = avg(weekly.slice(-8, -4).map(w => w.value));
          const trend_direction = recentAvg - priorAvg;

          await supabase.from('niche_demand_snapshots').upsert({
            niche_id: niche.id,
            snapshot_week: snapshotWeek,
            demand_score,
            trend_direction,
          }, { onConflict: 'niche_id,snapshot_week' });

          processed++;
        } catch (e) {
          skipped++;
          if (sampleErrors.length < 2) sampleErrors.push(`${niche.keyword}: ${e.message}`);
        }
      }));
      // 1.5 s between batches — Trends is rate-limited and has no official SLA
      if (i + CHUNK < niches.length) await new Promise(r => setTimeout(r, 1500));
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

const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
