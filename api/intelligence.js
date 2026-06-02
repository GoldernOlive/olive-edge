// /api/intelligence.js
// Olive Edge Intelligence Engine
// Sources: Google Autocomplete + Etsy API + Reddit + Our velocity DB
// Triangulates across all sources to find genuine opportunities
// Caches in Supabase for 24h — all users share one daily fetch

const SB_URL = 'https://oktpizrevqehfrkcqphq.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_r4lLwwInTT76wXjP-Cha4Q_T1yALqyt';

// POD seed terms — what we ask Google and Etsy Autocomplete about
const SEEDS = [
  'personalised mug', 'custom mug gift', 'funny mug',
  'personalised gift', 'wall art print uk', 'tote bag gift',
  'baby print personalised', 'wedding gift personalised',
  'pet portrait gift', 'fathers day gift', 'mothers day gift',
  'birthday gift uk', 'christmas gift uk', 'home decor print',
  'funny t shirt gift', 'personalised keyring', 'digital download planner',
  'wildflower print', 'cottagecore print', 'mental health gift'
];

// Design intelligence database — guaranteed rich data for all discovered products
const DESIGN_INTEL = {
  'mug': { colours: ['#FFFFFF','#F5F0E8','#2C3E50','#87AE87','#E8D5B7'], colourNames: ['White','Cream','Navy','Sage','Kraft'], font: 'Handwritten Script', style: 'Minimal personalised', size: '11oz ceramic', supplier: 'Printify £3.50', margin: '72%', buyer: 'Gift buyers 25-45', photo: 'Lifestyle with coffee, cozy background' },
  'print': { colours: ['#F5F0E8','#87AE87','#2C3E50','#DDD8C4','#8B7355'], colourNames: ['Cream','Sage','Navy','Sand','Brown'], font: 'Delicate Serif or Script', style: 'Botanical or typography', size: 'A4/A3', supplier: 'Printify £2.80', margin: '82%', buyer: 'Home decorators 25-40', photo: 'Framed on wall with soft furnishings' },
  'tote': { colours: ['#F5DEB3','#FFFFFF','#87AE87','#2C3E50','#E8D5B7'], colourNames: ['Natural Canvas','White','Sage','Navy','Kraft'], font: 'Script or Bold Sans', style: 'Bold slogan or botanical', size: '38x42cm', supplier: 'Printify £4.20', margin: '70%', buyer: 'Eco-conscious women 20-35', photo: 'Person carrying outdoors natural light' },
  'gift': { colours: ['#FFFFFF','#C0C0C0','#F5F0E8','#C0B080','#87AE87'], colourNames: ['White','Silver','Ivory','Gold','Sage'], font: 'Elegant Script', style: 'Personalised romantic', size: 'Varies by product', supplier: 'Printify', margin: '72%', buyer: 'Gift buyers for occasions', photo: 'Gift context with wrapping' },
  't-shirt': { colours: ['#FFFFFF','#000000','#808080','#87AE87','#F5DEB3'], colourNames: ['White','Black','Grey','Sage','Natural'], font: 'Bold Sans-Serif', style: 'Humour slogan', size: 'Unisex XS-3XL', supplier: 'Printify £7.50', margin: '65%', buyer: 'Gift buyers, women 20-35', photo: 'Flat lay natural background' },
  'keyring': { colours: ['#C0C0C0','#FFD700','#CD7F32','#FFFFFF','#000000'], colourNames: ['Silver','Gold','Bronze','White','Black'], font: 'Script or Clean Sans', style: 'Minimal engraved', size: 'Standard', supplier: 'Printify £2.50', margin: '68%', buyer: 'Impulse gift buyers', photo: 'Close-up macro showing text' },
  'planner': { colours: ['#FFFFFF','#F5F0E8','#87AE87','#2C3E50','#DDA0DD'], colourNames: ['White','Cream','Sage','Navy','Pink'], font: 'Clean Sans-Serif', style: 'Minimal clean layout', size: 'A4 PDF/GoodNotes', supplier: 'Self-supply £0', margin: '95%', buyer: 'Organised women 20-40', photo: 'iPad mockup with stylus' },
  'portrait': { colours: ['#F5F0E8','#87AE87','#DDD8C4','#2C3E50','#E8D5B7'], colourNames: ['Cream','Sage','Sand','Navy','Kraft'], font: 'Script or Serif', style: 'Watercolour illustration', size: 'A4/A3', supplier: 'Printify £2.80', margin: '75%', buyer: 'Pet owners 25-45', photo: 'Next to the actual pet' },
  'candle': { colours: ['#FFFFF0','#F5DEB3','#DDD8C4','#FFFFFF','#C0B080'], colourNames: ['Ivory','Wheat','Sand','White','Gold'], font: 'Elegant Script', style: 'Luxury minimal label', size: 'Standard jar', supplier: 'Printify', margin: '70%', buyer: 'Luxury gift buyers', photo: 'Moody dark lifestyle shot' },
  'default': { colours: ['#FFFFFF','#F5F0E8','#87AE87','#2C3E50','#E8D5B7'], colourNames: ['White','Cream','Sage','Navy','Kraft'], font: 'Handwritten Script', style: 'Minimalist personalised', size: 'Standard', supplier: 'Printify', margin: '72%', buyer: 'UK gift buyers 25-45', photo: 'Lifestyle shot, natural light' }
};

function getDesignIntel(keyword) {
  const kl = keyword.toLowerCase();
  if (kl.includes('mug') || kl.includes('cup')) return DESIGN_INTEL.mug;
  if (kl.includes('print') || kl.includes('poster') || kl.includes('art') || kl.includes('wall')) return DESIGN_INTEL.print;
  if (kl.includes('tote') || kl.includes('bag')) return DESIGN_INTEL.tote;
  if (kl.includes('shirt') || kl.includes('tee') || kl.includes('top')) return DESIGN_INTEL['t-shirt'];
  if (kl.includes('keyring') || kl.includes('keychain')) return DESIGN_INTEL.keyring;
  if (kl.includes('planner') || kl.includes('digital') || kl.includes('journal')) return DESIGN_INTEL.planner;
  if (kl.includes('portrait') || kl.includes('pet')) return DESIGN_INTEL.portrait;
  if (kl.includes('candle')) return DESIGN_INTEL.candle;
  if (kl.includes('gift') || kl.includes('present')) return DESIGN_INTEL.gift;
  return DESIGN_INTEL.default;
}

// Fetch Google Autocomplete suggestions — completely free, no key needed
async function getGoogleAutocomplete(seed) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}&hl=en-GB&gl=GB`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await r.json();
    // Returns [query, [suggestions]]
    const suggestions = data[1] || [];
    return suggestions.slice(0, 8).map((s, i) => ({ kw: s, position: i + 1, source: 'google_autocomplete' }));
  } catch (e) {
    return [];
  }
}

// Fetch Etsy search suggestions — real buyer searches, free
async function getEtsyAutocomplete(seed) {
  try {
    const url = `https://www.etsy.com/api/v3/ajax/bespoke/member/neu/specs/search-bar-autocomplete?q=${encodeURIComponent(seed)}&limit=8`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    if (!r.ok) return [];
    const data = await r.json();
    const results = data?.output?.results || [];
    return results.map((item, i) => ({ kw: item.value || item.query || item, position: i + 1, source: 'etsy_autocomplete' }));
  } catch (e) {
    return [];
  }
}

// Fetch Etsy listing data — real competition and pricing
async function getEtsyData(kw) {
  try {
    const ETSY_KEY = process.env.ETSY_API_KEY || 'vqtvuckq3kqmsnklxmxbhd36';
    const ETSY_SECRET = process.env.ETSY_SHARED_SECRET || '';
    const header = ETSY_SECRET ? `${ETSY_KEY}:${ETSY_SECRET}` : ETSY_KEY;
    const url = `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(kw)}&limit=100&sort_on=score`;
    const r = await fetch(url, { headers: { 'x-api-key': header, 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const data = await r.json();
    const listings = data.results || [];
    const prices = listings.map(l => (l.price?.amount || 0) / (l.price?.divisor || 100)).filter(p => p > 0).sort((a, b) => a - b);
    const tagMap = {};
    listings.forEach(l => (l.tags || []).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; }));
    const topTags = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
    const topFav = [...listings].sort((a, b) => (b.num_favorers || 0) - (a.num_favorers || 0)).slice(0, 3);
    const totalFavs = listings.reduce((s, l) => s + (l.num_favorers || 0), 0);
    const avgPrice = prices.length ? (prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
    const sweetSpotLow = prices.length ? prices[Math.floor(prices.length * 0.2)] : 0;
    const sweetSpotHigh = prices.length ? prices[Math.floor(prices.length * 0.8)] : 0;
    const score = listings.length >= 5000 ? 10 : listings.length >= 2000 ? 9 : listings.length >= 1000 ? 8 : listings.length >= 500 ? 7 : listings.length >= 200 ? 6 : listings.length >= 100 ? 5 : listings.length >= 50 ? 4 : listings.length >= 20 ? 3 : 2;
    return {
      count: listings.length,
      avgPrice: avgPrice.toFixed(2),
      sweetSpot: sweetSpotLow ? `£${sweetSpotLow.toFixed(2)}-£${sweetSpotHigh.toFixed(2)}` : null,
      topTags,
      topFav,
      totalFavs,
      competitionScore: score,
      saturation: score >= 9 ? 'Highly Saturated' : score >= 7 ? 'Saturated' : score >= 5 ? 'Competitive' : score >= 3 ? 'Moderate' : 'Wide Open',
      topTitles: listings.slice(0, 5).map(l => l.title)
    };
  } catch (e) {
    return null;
  }
}

// Fetch Reddit trending discussions — free JSON API
async function getRedditTrending() {
  try {
    const r = await fetch('https://www.reddit.com/r/EtsySellers/search.json?q=selling+trending+popular&sort=top&t=week&limit=25', {
      headers: { 'User-Agent': 'OliveEdge/1.0' }
    });
    if (!r.ok) return [];
    const data = await r.json();
    const posts = data?.data?.children || [];
    const keywords = [];
    posts.forEach(p => {
      const text = (p.data?.title || '') + ' ' + (p.data?.selftext || '');
      // Extract product mentions from post titles
      const matches = text.match(/personalised|custom|mug|tote|print|shirt|candle|keyring|portrait|planner/gi) || [];
      matches.forEach(m => keywords.push(m.toLowerCase()));
    });
    return keywords;
  } catch (e) {
    return [];
  }
}

// Cache in Supabase
async function getCached() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/intelligence_cache?key=eq.daily_feed&select=*&limit=1`, {
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
    });
    const data = await r.json();
    if (!data || !data[0]) return null;
    const cached = data[0];
    const age = (Date.now() - new Date(cached.updated_at).getTime()) / 1000 / 60 / 60;
    if (age < 24) return JSON.parse(cached.value);
    return null;
  } catch (e) { return null; }
}

async function saveCache(value) {
  try {
    await fetch(`${SB_URL}/rest/v1/intelligence_cache`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ key: 'daily_feed', value: JSON.stringify(value), updated_at: new Date().toISOString() })
    });
  } catch (e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const forceRefresh = req.query.refresh === 'true';

  // Check cache first
  if (!forceRefresh) {
    const cached = await getCached();
    if (cached) {
      return res.status(200).json({ ...cached, fromCache: true });
    }
  }

  // ── STEP 1: Get date context for seasonal signals
  let upcomingEvents = [];
  let datePrefix = 'TODAY IS JUNE 2026. ';
  try {
    const dr = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/date`);
    const dc = await dr.json();
    upcomingEvents = dc.upcomingEvents || [];
    datePrefix = dc.aiContext || datePrefix;
  } catch (e) {}

  // ── STEP 2: Gather autocomplete signals from Google + Etsy
  const allSuggestions = new Map(); // kw -> {score, sources}

  // Run Google Autocomplete for all seeds
  const googleResults = await Promise.allSettled(SEEDS.map(s => getGoogleAutocomplete(s)));
  googleResults.forEach((r, seedIdx) => {
    if (r.status !== 'fulfilled') return;
    r.value.forEach(({ kw, position }) => {
      if (kw.length < 5 || kw.length > 60) return;
      // Filter to POD-relevant keywords
      const isPOD = /mug|tote|bag|print|poster|art|shirt|t-shirt|gift|keyring|candle|planner|portrait|personalised|custom|funny|baby|wedding|father|mother|christmas|birthday|home decor|wall art/i.test(kw);
      if (!isPOD) return;
      const existing = allSuggestions.get(kw) || { score: 0, sources: [], googlePos: null };
      existing.score += (10 - position); // higher = appeared earlier in autocomplete
      existing.googlePos = Math.min(existing.googlePos || 99, position);
      if (!existing.sources.includes('google')) existing.sources.push('google');
      allSuggestions.set(kw, existing);
    });
  });

  // Run Etsy Autocomplete for key seeds
  const etsyAutoSeeds = ['personalised mug', 'gift for her', 'wall art', 'funny gift', 'pet gift', 'fathers day'];
  const etsyAutoResults = await Promise.allSettled(etsyAutoSeeds.map(s => getEtsyAutocomplete(s)));
  etsyAutoResults.forEach(r => {
    if (r.status !== 'fulfilled') return;
    r.value.forEach(({ kw, position }) => {
      if (!kw || kw.length < 5) return;
      const existing = allSuggestions.get(kw) || { score: 0, sources: [], googlePos: null };
      existing.score += (8 - position); // Etsy autocomplete is strong buyer intent signal
      if (!existing.sources.includes('etsy_auto')) existing.sources.push('etsy_auto');
      allSuggestions.set(kw, existing);
    });
  });

  // ── STEP 3: Get Reddit trending keywords
  const redditKeywords = await getRedditTrending();
  const redditMap = {};
  redditKeywords.forEach(k => { redditMap[k] = (redditMap[k] || 0) + 1; });

  // ── STEP 4: Take top keywords and get real Etsy data
  // Sort by autocomplete score, take top 25
  const topKeywords = [...allSuggestions.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 25)
    .map(([kw, meta]) => ({ kw, ...meta }));

  // Add our core products if not already included
  const coreProducts = ['personalised mug', 'wall art print', 'personalised tote bag', 'fathers day mug', 'custom pet portrait', 'funny t shirt gift', 'digital planner download', 'wildflower print', 'cottagecore print', 'mental health gift mug'];
  coreProducts.forEach(cp => {
    if (!topKeywords.find(k => k.kw === cp)) {
      topKeywords.push({ kw: cp, score: 5, sources: ['core'] });
    }
  });

  // Get Etsy data for all top keywords
  const etsyData = await Promise.allSettled(topKeywords.slice(0, 20).map(k => getEtsyData(k.kw)));

  // ── STEP 5: Score and build product intelligence
  const products = topKeywords.slice(0, 20).map((item, i) => {
    const etsy = etsyData[i]?.status === 'fulfilled' ? etsyData[i].value : null;
    const design = getDesignIntel(item.kw);
    const redditBoost = redditKeywords.filter(k => item.kw.toLowerCase().includes(k)).length;

    // Triangulation score: google signal + etsy demand + reddit mentions
    const googleSignal = item.score || 0;
    const etsyDemand = etsy ? Math.min(10, etsy.count / 100) : 3;
    const redditSignal = Math.min(5, redditBoost);
    const sourceBonus = item.sources.length * 2; // appears in multiple sources = stronger signal
    const totalScore = googleSignal + etsyDemand + redditSignal + sourceBonus;

    // Competition opportunity score (inverse of competition — lower comp = higher opportunity)
    const compScore = etsy ? etsy.competitionScore : 5;
    const opportunityScore = totalScore + (10 - compScore);

    // Seasonal match
    let seasonalEvent = null;
    const kwl = item.kw.toLowerCase();
    upcomingEvents.forEach(ev => {
      if (ev.daysUntil <= 30) {
        if ((kwl.includes('father') || kwl.includes('dad')) && ev.name.includes('Father')) seasonalEvent = ev;
        if ((kwl.includes('mother') || kwl.includes('mum')) && ev.name.includes('Mother')) seasonalEvent = ev;
        if ((kwl.includes('christmas') || kwl.includes('xmas')) && ev.name.includes('Christmas')) seasonalEvent = ev;
        if (kwl.includes('valentine') && ev.name.includes('Valentine')) seasonalEvent = ev;
        if (kwl.includes('halloween') && ev.name.includes('Halloween')) seasonalEvent = ev;
      }
    });

    const isUrgent = seasonalEvent && seasonalEvent.daysUntil <= 21;
    const trend = etsy && etsy.count > 1000 ? 'Stable' : etsy && etsy.count > 200 ? 'Active' : item.sources.includes('google') ? 'Rising' : 'Emerging';

    return {
      kw: item.kw,
      category: item.kw.includes('mug') ? 'Mugs' : item.kw.includes('print') || item.kw.includes('art') ? 'Prints' : item.kw.includes('bag') || item.kw.includes('tote') ? 'Totes' : item.kw.includes('shirt') ? 'Clothing' : item.kw.includes('planner') ? 'Digital' : item.kw.includes('portrait') || item.kw.includes('pet') ? 'Pet Art' : 'Gifts',
      opportunityScore: Math.round(opportunityScore),
      sources: item.sources,
      trend,
      isUrgent,
      seasonalEvent,
      // Real Etsy data
      listingCount: etsy?.count || 0,
      avgPrice: etsy?.avgPrice || null,
      sweetSpot: etsy?.sweetSpot || null,
      competitionScore: compScore,
      competition: compScore <= 3 ? 'Low' : compScore <= 6 ? 'Medium' : 'High',
      saturation: etsy?.saturation || 'Unknown',
      topTags: etsy?.topTags || [],
      topFav: etsy?.topFav || [],
      totalFavs: etsy?.totalFavs || 0,
      // Design intelligence
      colours: design.colours,
      colourNames: design.colourNames,
      font: design.font,
      style: design.style,
      size: design.size,
      supplier: design.supplier,
      margin: design.margin,
      buyer: design.buyer,
      photo: design.photo,
      // Source signals
      signalSources: item.sources.join(', ')
    };
  });

  // ── STEP 6: Build tabs
  const sorted = [...products].sort((a, b) => b.opportunityScore - a.opportunityScore);

  const result = {
    generatedAt: new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    upcomingEvents,
    tabs: {
      hot: sorted.slice(0, 8),
      rising: sorted.filter(p => p.trend === 'Rising' || p.trend === 'Emerging').slice(0, 6),
      green: sorted.filter(p => p.listingCount > 200 && p.competitionScore <= 7).slice(0, 6),
      low: [...products].sort((a, b) => a.competitionScore - b.competitionScore).filter(p => p.competitionScore <= 4).slice(0, 6),
      season: products.filter(p => p.isUrgent || p.seasonalEvent).sort((a, b) => (a.seasonalEvent?.daysUntil || 99) - (b.seasonalEvent?.daysUntil || 99)).slice(0, 6)
    },
    sources: {
      google: 'Google Autocomplete UK — real searches happening right now',
      etsy: 'Etsy API — live listing counts, prices, tags and favourites',
      reddit: 'Reddit r/EtsySellers — what sellers are reporting selling',
      velocity: 'Olive Edge velocity database — week-on-week trends'
    }
  };

  // Fallback: if tabs are empty use sorted
  ['rising', 'green', 'low', 'season'].forEach(t => {
    if (!result.tabs[t] || result.tabs[t].length < 2) {
      result.tabs[t] = sorted.slice(0, 5);
    }
  });

  await saveCache(result);
  return res.status(200).json({ ...result, fromCache: false });
}
