// Olive Edge — Weekly Discovery Cron (Phase A)
// Schedule: 0 7 * * 1 (Monday 07:00 UTC)
// Expands SEEDS via Google Autocomplete + Reddit → writes niche_candidates → promotes top 5 into niches

import { createClient } from '@supabase/supabase-js';
import { SEEDS, googleAutocomplete, redditBuyerDemand } from '../lib/discovery.js';

const PROMOTION_CAP = 5;
const DEMAND_THRESHOLD = 40;

export default async function handler(req, res) {
  try {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) return res.status(500).json({ error: 'missing_env_vars', missing });

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
    const { data: existingNiches } = await supabase.from('niches').select('keyword');
    const tracked = new Set((existingNiches || []).map(n => n.keyword.toLowerCase()));

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

    return res.status(200).json({
      week: discoveredWeek,
      seedsExpanded: SEEDS.length,
      candidatesFound: candidateMap.size,
      aboveThreshold: candidates.length,
      promoted,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, stack: String(e.stack || '').split('\n').slice(0, 5) });
  }
}
