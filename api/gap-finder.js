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

// Full design intelligence database
const DESIGN_DB = {
  mug:     { supplier:'Printify', baseCost:'£3.50', margin:'72%', size:'11oz ceramic', font:'Handwritten Script', style:'Minimal personalised name/date', colours:['#FFFFFF','#F5F0E8','#2C3E50','#87AE87','#8B4513'], colourNames:['White','Cream','Navy','Sage','Brown'], phrases:['Best Mum Ever','Dog Dad','Est. [Year]','Promoted to Grandma','Cat Mum'], searches:'~45,000/mo', type:'Mug' },
  print:   { supplier:'Printify', baseCost:'£2.80', margin:'82%', size:'A4/A3 print',  font:'Delicate Serif or Script', style:'Botanical illustration or bold typography', colours:['#F5F0E8','#87AE87','#2C3E50','#DDD8C4','#8B7355'], colourNames:['Cream','Sage','Navy','Sand','Brown'], phrases:['She Believed She Could','Wild and Free','Home is Where the Heart Is'], searches:'~38,000/mo', type:'Print' },
  tote:    { supplier:'Printify', baseCost:'£4.20', margin:'70%', size:'38x42cm canvas', font:'Script or Bold Sans', style:'Bold slogan or botanical illustration', colours:['#F5DEB3','#FFFFFF','#87AE87','#2C3E50','#000000'], colourNames:['Natural Canvas','White','Sage','Navy','Black'], phrases:['Tote-ally Awesome','Book Lover','Plant Lady','Bookish'], searches:'~22,000/mo', type:'Tote Bag' },
  shirt:   { supplier:'Printify', baseCost:'£7.50', margin:'65%', size:'Unisex XS-3XL', font:'Bold Sans or Brush', style:'Humour slogan with simple illustration', colours:['#FFFFFF','#000000','#808080','#87AE87','#F5DEB3'], colourNames:['White','Black','Heather Grey','Sage','Natural'], phrases:["But First Coffee","I Can't Adult Today","Dog Mum","Plant Lady"], searches:'~31,000/mo', type:'T-Shirt' },
  pet:     { supplier:'Printify', baseCost:'£2.80', margin:'75%', size:'A4/A3 print',  font:'Script or Serif', style:'Watercolour pet illustration', colours:['#F5F0E8','#87AE87','#DDD8C4','#2C3E50','#E8D5B7'], colourNames:['Cream','Sage','Sand','Navy','Kraft'], phrases:['[Pet Name] The Good Boy','Best Cat Ever','In Loving Memory'], searches:'~19,000/mo', type:'Pet Art' },
  keyring: { supplier:'Printify', baseCost:'£2.50', margin:'68%', size:'Standard round', font:'Script or Clean Sans', style:'Minimal engraved text', colours:['#C0C0C0','#FFD700','#CD7F32','#FFFFFF','#000000'], colourNames:['Silver','Gold','Bronze','White','Black'], phrases:['[Name]','Est. [Year]','You Are My Sunshine'], searches:'~12,000/mo', type:'Keyring' },
  planner: { supplier:'Self-supply', baseCost:'£0', margin:'95%', size:'A4 PDF/GoodNotes', font:'Clean Sans-Serif', style:'Minimal clean layout', colours:['#FFFFFF','#F5F0E8','#87AE87','#2C3E50','#DDA0DD'], colourNames:['White','Cream','Sage','Navy','Pink'], phrases:['2026 Daily Planner','Habit Tracker','Goal Setting'], searches:'~21,000/mo', type:'Digital' },
  cottage: { supplier:'Printify', baseCost:'£2.80', margin:'82%', size:'A4/A3',         font:'Delicate Serif or Hand-drawn', style:'Botanical pressed flowers', colours:['#87AE87','#F5F0E8','#DDA0DD','#8FBC8F','#F5DEB3'], colourNames:['Sage','Cream','Lavender','Forest','Wheat'], phrases:['Wild Flowers','Gather Here','Bloom Where You Are Planted'], searches:'~14,000/mo', type:'Cottagecore Print' },
  mental:  { supplier:'Printify', baseCost:'£3.50', margin:'72%', size:'Mug or A4 print', font:'Gentle Rounded Script', style:'Soft uplifting typography', colours:['#DDA0DD','#98FB98','#ADD8E6','#FFB6C1','#F5F0E8'], colourNames:['Lavender','Mint','Sky Blue','Blush','Cream'], phrases:["You've Got This","It's OK Not to Be OK","Be Kind to Your Mind"], searches:'~9,000/mo', type:'Wellness Gift' },
  baby:    { supplier:'Printify', baseCost:'£2.80', margin:'82%', size:'A4 or 8x10 inch', font:'Delicate Rounded Script', style:'Watercolour floral with name', colours:['#FFB6C1','#ADD8E6','#87AE87','#FFF5E4','#DDA0DD'], colourNames:['Pink','Blue','Sage','Peach','Lavender'], phrases:['[Name] Est. [Year]','Little One','Our Greatest Adventure'], searches:'~18,000/mo', type:'Baby Print' },
  gift:    { supplier:'Printify', baseCost:'£3.50', margin:'72%', size:'Varies', font:'Script or Bold Sans', style:'Personalised with name or occasion', colours:['#FFFFFF','#F5F0E8','#87AE87','#2C3E50','#C0B080'], colourNames:['White','Cream','Sage','Navy','Gold'], phrases:['Made with Love','Est. [Year]','Best [Recipient] Ever'], searches:'~25,000/mo', type:'Gift Product' },
  default: { supplier:'Printify', baseCost:'£3.50', margin:'70%', size:'Standard', font:'Handwritten Script', style:'Minimal personalised', colours:['#FFFFFF','#F5F0E8','#87AE87','#2C3E50','#E8D5B7'], colourNames:['White','Cream','Sage','Navy','Kraft'], phrases:['Personalised for [Name]','Est. [Year]','Made with Love'], searches:'~10,000/mo', type:'Gift Product' }
};

function getDesignInfo(kw) {
  const k = kw.toLowerCase();
  if (k.includes('mug') || k.includes('cup')) return DESIGN_DB.mug;
  if (k.includes('tote') || k.includes('bag')) return DESIGN_DB.tote;
  if (k.includes('shirt') || k.includes('tee')) return DESIGN_DB.shirt;
  if (k.includes('pet') || k.includes('portrait') || k.includes('dog') || k.includes('cat') || k.includes('labrador') || k.includes('cockapoo') || k.includes('dachshund')) return DESIGN_DB.pet;
  if (k.includes('keyring') || k.includes('keychain')) return DESIGN_DB.keyring;
  if (k.includes('planner') || k.includes('digital') || k.includes('tracker')) return DESIGN_DB.planner;
  if (k.includes('cottage') || k.includes('botanical') || k.includes('wildflower') || k.includes('mushroom') || k.includes('frog')) return DESIGN_DB.cottage;
  if (k.includes('mental') || k.includes('wellbeing') || k.includes('anxiety') || k.includes('witchy')) return DESIGN_DB.mental;
  if (k.includes('baby') || k.includes('nursery') || k.includes('newborn')) return DESIGN_DB.baby;
  if (k.includes('print') || k.includes('poster') || k.includes('art') || k.includes('wall')) return DESIGN_DB.print;
  if (k.includes('gift') || k.includes('teacher') || k.includes('nurse') || k.includes('bookish') || k.includes('reading') || k.includes('yoga') || k.includes('gym') || k.includes('gardening') || k.includes('baking') || k.includes('hiking')) return DESIGN_DB.gift;
  return DESIGN_DB.default;
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
// Estimated competition per keyword type — used when Etsy API unavailable
const ESTIMATED_COMPETITION = {
  // Very high competition (saturated)
  'personalised mug': 9, 'funny mug': 8, 'custom mug': 9, 'wall art print': 9,
  'personalised gift': 9, 'birthday gift': 8, 'christmas gift': 9,
  // Medium-high
  'tote bag': 7, 'funny t shirt': 7, 'personalised tote': 7, 'baby gift': 7,
  'wedding gift': 7, 'pet portrait': 6, 'digital planner': 6,
  // Medium
  'cottagecore': 5, 'botanical print': 5, 'wildflower': 5, 'motivational print': 5,
  'mental health': 5, 'graduation gift': 5, 'teacher gift': 5,
  // Low-medium  
  'bookish gift': 4, 'reading gift': 4, 'yoga gift': 4, 'gym gift': 4,
  'gardening gift': 4, 'baking gift': 4, 'nurse gift': 4,
  // Low competition (specific niches)
  'labrador gift': 3, 'cockapoo gift': 2, 'dachshund gift': 2, 'french bulldog gift': 3,
  'accountant gift': 2, 'lawyer gift': 2, 'engineer gift': 2, 'hiking gift': 3,
  'mushroom gift': 3, 'frog gift': 2, 'witchy gift': 3, 'dark academia': 3,
  'cottagecore kitchen': 2, 'dog breed': 2, 'funny accountant': 2
};

function estimateCompetition(kw) {
  const k = kw.toLowerCase();
  // Check specific matches first
  for (const [term, score] of Object.entries(ESTIMATED_COMPETITION)) {
    if (k.includes(term)) return score;
  }
  // Generic estimates by product type
  if (k.includes('personalised') && k.includes('mug')) return 9;
  if (k.includes('mug')) return 7;
  if (k.includes('print') || k.includes('wall art')) return 7;
  if (k.includes('tote') || k.includes('bag')) return 6;
  if (k.includes('shirt') || k.includes('tee')) return 7;
  // Specific animal breeds = low comp
  if (/labrador|cockapoo|dachshund|spaniel|poodle|schnauzer|border collie|shih tzu/.test(k)) return 2;
  // Specific occupations = low comp
  if (/accountant|solicitor|lawyer|engineer|pharmacist|dentist|architect|plumber/.test(k)) return 2;
  // Specific hobbies = low-medium comp
  if (/yoga|pilates|hiking|baking|sewing|knitting|cycling|running/.test(k)) return 3;
  // Aesthetic niches = medium comp
  if (/cottagecore|dark academia|botanical|wildflower|mushroom|frog|witchy/.test(k)) return 4;
  return 5; // default medium
}

function calcGapScore(googlePosition, etsyCount, redditMentions, kw) {
  // Google signal: position 1 = strongest, position 8 = weakest
  const googleStrength = googlePosition ? Math.max(0, 10 - googlePosition) : 3;

  // Use real Etsy count if available, otherwise estimate from keyword
  let supplyScore;
  if (etsyCount !== null && etsyCount !== undefined) {
    supplyScore = etsyCount < 50 ? 10
      : etsyCount < 100 ? 9
      : etsyCount < 200 ? 8
      : etsyCount < 500 ? 7
      : etsyCount < 1000 ? 5
      : etsyCount < 2000 ? 3
      : etsyCount < 5000 ? 2
      : 1;
  } else {
    // Use keyword-based estimate — ensures scores vary even without Etsy data
    const estimated = kw ? estimateCompetition(kw) : 5;
    supplyScore = 11 - estimated; // invert: low competition = high supply score
  }

  // Reddit demand boost
  const redditBoost = Math.min(3, redditMentions || 0);

  // Keyword specificity bonus — more specific = less competition
  const words = (kw || '').split(' ').length;
  const specificityBonus = words >= 4 ? 3 : words >= 3 ? 1 : 0;

  // Gap score = demand signal × supply gap + boosts
  const rawScore = (googleStrength * supplyScore) + (redditBoost * 5) + specificityBonus;
  return Math.min(100, Math.round(rawScore * 1.2));
}

function urgencyLabel(gapScore, etsyCount) {
  if (gapScore >= 80) return { label: 'LIST TODAY', colour: '#dc2626', icon: '🚨' };
  if (gapScore >= 65) return { label: 'List this week', colour: '#ea580c', icon: '⚡' };
  if (gapScore >= 50) return { label: 'Good opportunity', colour: '#ca8a04', icon: '✅' };
  if (gapScore >= 35) return { label: 'Worth testing', colour: '#16a34a', icon: '🔍' };
  return { label: 'Monitor', colour: '#6b7280', icon: '👀' };
}

function competitionLabel(count, kw) {
  if (count === null) {
    // Use keyword estimate
    const est = kw ? estimateCompetition(kw) : 5;
    if (est <= 2) return { label: 'Very Low (est.)', colour: '#22c55e' };
    if (est <= 3) return { label: 'Low (est.)', colour: '#84cc16' };
    if (est <= 5) return { label: 'Medium (est.)', colour: '#ca8a04' };
    if (est <= 7) return { label: 'High (est.)', colour: '#ea580c' };
    return { label: 'Saturated (est.)', colour: '#dc2626' };
  }
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

    const gapScore = calcGapScore(item.googlePosition, count, redditBoost, item.kw);
    const urgency = urgencyLabel(gapScore, count);
    const competition = competitionLabel(count, item.kw);
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
      colours: design.colours,
      colourNames: design.colourNames,
      phrases: design.phrases,
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
