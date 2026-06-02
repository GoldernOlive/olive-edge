// /api/gap-finder.js
// The Gap Finder — Olive Edge's most powerful feature
// Finds products people are actively searching for but can't find on Etsy
// Formula: High Google search signal + Low Etsy listings = OPPORTUNITY
// Nobody else does this automatically

const SB_URL = 'https://oktpizrevqehfrkcqphq.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_r4lLwwInTT76wXjP-Cha4Q_T1yALqyt';

// Seed terms — broad POD categories we expand via autocomplete
const SEEDS = [
  // Mugs — most popular POD category
  'personalised mug', 'funny mug', 'custom mug gift', 'novelty mug uk',
  // Prints & wall art
  'personalised print gift', 'wall art print uk', 'home decor print',
  // Totes & bags
  'personalised tote bag', 'funny tote bag gift',
  // Clothing
  'funny t shirt gift uk', 'novelty t shirt',
  // Gifts by recipient
  'gift for dog lover', 'gift for cat lover', 'gift for teacher',
  'gift for nurse', 'gift for mum', 'gift for dad', 'gift for grandma',
  'gift for best friend', 'gift for sister', 'gift for boyfriend',
  // Gifts by occasion  
  'fathers day gift', 'mothers day gift', 'birthday gift personalised',
  'graduation gift uk', 'new baby gift personalised',
  // Aesthetics & trends
  'cottagecore gift', 'dark academia print', 'botanical print gift',
  'witchy gift uk', 'mushroom gift', 'frog gift',
  // Hobbies & occupations
  'bookish gift', 'reading gift', 'yoga gift', 'gym gift',
  'gardening gift', 'baking gift', 'hiking gift',
  'accountant gift', 'lawyer gift', 'engineer gift',
  // Pets by breed
  'labrador gift', 'golden retriever gift', 'cockapoo gift',
  'dachshund gift', 'french bulldog gift', 'cat gift personalised'
];

// Design intelligence for scoring
const DESIGN_DB = {
  mug: { supplier: 'Printify', baseCost: '£3.50', margin: '72%', size: '11oz ceramic' },
  print: { supplier: 'Printify', baseCost: '£2.80', margin: '82%', size: 'A4/A3' },
  tote: { supplier: 'Printify', baseCost: '£4.20', margin: '70%', size: '38x42cm' },
  shirt: { supplier: 'Printify', baseCost: '£7.50', margin: '65%', size: 'Unisex XS-3XL' },
  gift: { supplier: 'Printify', baseCost: '£3.50', margin: '72%', size: 'Varies' },
  default: { supplier: 'Printify', baseCost: '£3.50', margin: '70%', size: 'Standard' }
};

function getDesignInfo(kw) {
  const k = kw.toLowerCase();
  if (k.includes('mug') || k.includes('cup')) return { ...DESIGN_DB.mug, type: 'Mug' };
  if (k.includes('print') || k.includes('poster') || k.includes('art') || k.includes('wall')) return { ...DESIGN_DB.print, type: 'Print' };
  if (k.includes('tote') || k.includes('bag')) return { ...DESIGN_DB.tote, type: 'Tote Bag' };
  if (k.includes('shirt') || k.includes('tee')) return { ...DESIGN_DB.shirt, type: 'T-Shirt' };
  return { ...DESIGN_DB.gift, type: 'Gift Product' };
}

// Google Autocomplete — completely free, real searches
async function googleAutocomplete(seed) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}&hl=en-GB&gl=GB`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data[1] || []).slice(0, 8).map((s, i) => ({ kw: String(s).trim(), position: i + 1 }));
  } catch (e) { return []; }
}

// Etsy listing count — real competition data
async function etsyCount(kw) {
  try {
    const ETSY_KEY = process.env.ETSY_API_KEY || 'vqtvuckq3kqmsnklxmxbhd36';
    const ETSY_SECRET = process.env.ETSY_SHARED_SECRET || '';
    const header = ETSY_SECRET ? `${ETSY_KEY}:${ETSY_SECRET}` : ETSY_KEY;
    const url = `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(kw)}&limit=25&sort_on=score`;
    const r = await fetch(url, {
      headers: { 'x-api-key': header, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    const data = await r.json();
    const listings = (data.results || []).filter(l => l.currency_code !== 'EUR');
    const count = data.count || listings.length;
    const prices = listings.map(l => (l.price?.amount || 0) / (l.price?.divisor || 100)).filter(p => p > 0).sort((a, b) => a - b);
    const tagMap = {};
    listings.forEach(l => (l.tags || []).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; }));
    const topTags = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
    const avgPrice = prices.length ? (prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2) : null;
    const topFav = [...listings].sort((a, b) => (b.num_favorers || 0) - (a.num_favorers || 0)).slice(0, 2);
    return { count, avgPrice, topTags, topFav };
  } catch (e) { return null; }
}

// Reddit buyer demand — people asking "where can I find X"
async function redditBuyerDemand() {
  try {
    const searches = [
      'https://www.reddit.com/r/Etsy/search.json?q=looking+for+where+can+I+find&sort=new&t=week&limit=25',
      'https://www.reddit.com/r/EtsySellers/search.json?q=best+selling+trending&sort=top&t=week&limit=25'
    ];
    const results = await Promise.allSettled(searches.map(url =>
      fetch(url, { headers: { 'User-Agent': 'OliveEdge/1.0' }, signal: AbortSignal.timeout(5000) }).then(r => r.json())
    ));
    const mentions = {};
    results.forEach(r => {
      if (r.status !== 'fulfilled') return;
      const posts = r.value?.data?.children || [];
      posts.forEach(p => {
        const text = ((p.data?.title || '') + ' ' + (p.data?.selftext || '')).toLowerCase();
        const podTerms = ['mug', 'tote', 'print', 'poster', 'shirt', 'gift', 'personalised', 'custom',
          'dog', 'cat', 'mum', 'dad', 'nurse', 'teacher', 'bookish', 'cottagecore', 'botanical',
          'mushroom', 'frog', 'witchy', 'yoga', 'gym', 'gardening', 'reading'];
        podTerms.forEach(term => {
          if (text.includes(term)) mentions[term] = (mentions[term] || 0) + 1;
        });
      });
    });
    return mentions;
  } catch (e) { return {}; }
}

// Calculate gap score — the core algorithm
// High score = people searching + few sellers = OPPORTUNITY
function calcGapScore(googlePosition, etsyCount, redditMentions) {
  // Google signal: position 1 = strongest, position 8 = weakest
  const googleStrength = googlePosition ? Math.max(0, 10 - googlePosition) : 3;

  // Etsy supply score: fewer listings = bigger gap
  // Under 100 = massive gap, 100-500 = good gap, 500-2000 = moderate, 2000+ = saturated
  const supplyScore = etsyCount === null ? 5
    : etsyCount < 50 ? 10
    : etsyCount < 100 ? 9
    : etsyCount < 200 ? 8
    : etsyCount < 500 ? 7
    : etsyCount < 1000 ? 5
    : etsyCount < 2000 ? 3
    : etsyCount < 5000 ? 2
    : 1;

  // Reddit demand boost
  const redditBoost = Math.min(3, redditMentions || 0);

  // Gap score = demand signal × supply gap + reddit boost
  const rawScore = (googleStrength * supplyScore) + (redditBoost * 5);
  return Math.min(100, Math.round(rawScore * 1.2));
}

function urgencyLabel(gapScore, etsyCount) {
  if (gapScore >= 80) return { label: 'LIST TODAY', colour: '#dc2626', icon: '🚨' };
  if (gapScore >= 65) return { label: 'List this week', colour: '#ea580c', icon: '⚡' };
  if (gapScore >= 50) return { label: 'Good opportunity', colour: '#ca8a04', icon: '✅' };
  if (gapScore >= 35) return { label: 'Worth testing', colour: '#16a34a', icon: '🔍' };
  return { label: 'Monitor', colour: '#6b7280', icon: '👀' };
}

function competitionLabel(count) {
  if (count === null) return { label: 'Unknown', colour: '#6b7280' };
  if (count < 50) return { label: 'Virtually None', colour: '#16a34a' };
  if (count < 200) return { label: 'Very Low', colour: '#22c55e' };
  if (count < 500) return { label: 'Low', colour: '#84cc16' };
  if (count < 1000) return { label: 'Medium', colour: '#ca8a04' };
  if (count < 5000) return { label: 'High', colour: '#ea580c' };
  return { label: 'Saturated', colour: '#dc2626' };
}

async function getCached() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/intelligence_cache?key=eq.gap_finder&select=*&limit=1`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    const data = await r.json();
    if (!data?.[0]) return null;
    const age = (Date.now() - new Date(data[0].updated_at).getTime()) / 1000 / 60 / 60;
    if (age < 12) return JSON.parse(data[0].value); // Cache 12 hours for gap finder
    return null;
  } catch (e) { return null; }
}

async function saveCache(value) {
  try {
    await fetch(`${SB_URL}/rest/v1/intelligence_cache`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ key: 'gap_finder', value: JSON.stringify(value), updated_at: new Date().toISOString() })
    });
  } catch (e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const forceRefresh = req.query.refresh === 'true';
  if (!forceRefresh) {
    const cached = await getCached();
    if (cached) return res.status(200).json({ ...cached, fromCache: true });
  }

  // Step 1: Get Reddit demand signals
  const redditSignals = await redditBuyerDemand();

  // Step 2: Expand all seeds via Google Autocomplete
  const allKeywords = new Map(); // kw -> { googlePosition, sources }

  const autoResults = await Promise.allSettled(
    SEEDS.map(seed => googleAutocomplete(seed))
  );

  autoResults.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const seed = SEEDS[i];
    result.value.forEach(({ kw, position }) => {
      if (!kw || kw.length < 6 || kw.length > 55) return;
      // Must be POD-relevant
      const podRelevant = /mug|cup|tote|bag|print|poster|art|shirt|tee|gift|keyring|candle|planner|portrait|personalised|custom|funny|novelty/i.test(kw);
      if (!podRelevant) return;
      const existing = allKeywords.get(kw) || { googlePosition: 99, appearances: 0, seeds: [] };
      existing.googlePosition = Math.min(existing.googlePosition, position);
      existing.appearances += 1;
      existing.seeds.push(seed);
      allKeywords.set(kw, existing);
    });
  });

  // Add seeds themselves if they appear in autocomplete multiple times
  SEEDS.forEach(seed => {
    if (!allKeywords.has(seed)) {
      allKeywords.set(seed, { googlePosition: 5, appearances: 1, seeds: [seed] });
    }
  });

  // Step 3: Take top keywords by Google signal strength
  const topKeywords = [...allKeywords.entries()]
    .sort((a, b) => {
      // Sort by appearances first (appeared in multiple seed results = stronger signal)
      const scoreDiff = b[1].appearances - a[1].appearances;
      if (scoreDiff !== 0) return scoreDiff;
      return a[1].googlePosition - b[1].googlePosition;
    })
    .slice(0, 40)
    .map(([kw, meta]) => ({ kw, ...meta }));

  // Step 4: Get Etsy counts for all keywords in batches
  const etsyResults = [];
  for (let i = 0; i < topKeywords.length; i += 5) {
    const batch = topKeywords.slice(i, i + 5);
    const batchResults = await Promise.allSettled(batch.map(k => etsyCount(k.kw)));
    etsyResults.push(...batchResults);
    if (i + 5 < topKeywords.length) await new Promise(r => setTimeout(r, 400));
  }

  // Step 5: Score everything and build gap opportunities
  const opportunities = topKeywords.map((item, i) => {
    const etsy = etsyResults[i]?.status === 'fulfilled' ? etsyResults[i].value : null;
    const count = etsy?.count || null;

    // Reddit boost
    const redditBoost = Object.entries(redditSignals).reduce((boost, [term, mentions]) => {
      return item.kw.toLowerCase().includes(term) ? boost + Math.min(2, mentions) : boost;
    }, 0);

    const gapScore = calcGapScore(item.googlePosition, count, redditBoost);
    const urgency = urgencyLabel(gapScore, count);
    const competition = competitionLabel(count);
    const design = getDesignInfo(item.kw);

    // Window estimate — how long before this gets saturated
    const window = count === null ? 'Unknown'
      : count < 50 ? 'Wide open — list immediately'
      : count < 200 ? '2-4 weeks before it fills up'
      : count < 500 ? '1-2 months window remaining'
      : count < 1000 ? 'Entering competitive phase'
      : 'Already competitive — need strong differentiation';

    return {
      kw: item.kw,
      gapScore,
      urgency,
      competition,
      window,
      googlePosition: item.googlePosition,
      googleAppearances: item.appearances,
      listingCount: count,
      avgPrice: etsy?.avgPrice || null,
      topTags: etsy?.topTags || [],
      topFav: etsy?.topFav || [],
      redditBoost,
      design,
      // What makes this specific gap interesting
      insight: count === null ? `Real Google search signal — Etsy data pending`
        : count < 50 ? `Only ${count} sellers — ${item.appearances > 1 ? 'multiple Google searches pointing here' : 'Google autocomplete confirms real demand'}. Move now.`
        : count < 200 ? `${count} listings is low for this demand level. Early mover advantage still available.`
        : count < 500 ? `${count} listings — competitive but beatable with strong design and SEO.`
        : `${count?.toLocaleString()} listings. High competition — needs clear differentiation to win.`
    };
  });

  // Step 6: Sort by gap score and separate into tiers
  const sorted = opportunities.sort((a, b) => b.gapScore - a.gapScore);

  const result = {
    generatedAt: new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    totalScanned: allKeywords.size,
    seedsUsed: SEEDS.length,
    redditSignals: Object.keys(redditSignals).length,
    tiers: {
      immediate: sorted.filter(o => o.gapScore >= 75).slice(0, 8),    // List TODAY
      thisWeek: sorted.filter(o => o.gapScore >= 55 && o.gapScore < 75).slice(0, 10), // List this week
      monitor: sorted.filter(o => o.gapScore >= 35 && o.gapScore < 55).slice(0, 10),  // Watch
    },
    all: sorted.slice(0, 30)
  };

  await saveCache(result);
  return res.status(200).json({ ...result, fromCache: false });
}
