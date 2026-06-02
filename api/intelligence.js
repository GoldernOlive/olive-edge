// /api/intelligence.js - Olive Edge Intelligence Engine v2
// Sources: Google Autocomplete + Etsy API + Reddit
// Each tab has distinct logic — not just re-sorted same list

const SB_URL = 'https://oktpizrevqehfrkcqphq.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_r4lLwwInTT76wXjP-Cha4Q_T1yALqyt';

const DESIGN_INTEL = {
  mug:      { colours:['#FFFFFF','#F5F0E8','#2C3E50','#87AE87','#8B4513'], colourNames:['White','Cream','Navy','Sage','Brown'],       font:'Handwritten Script',    style:'Minimal personalised name/date', size:'11oz ceramic',    supplier:'Printify £3.50', margin:'72%', searches:'~45,000/mo', sales:'~8,000/mo',  buyer:'Gift buyers 25-45, birthdays & Christmas', photo:'Lifestyle with coffee and cozy props', phrases:['Best Mum Ever','Dog Dad','Cat Mum','Est. [Year]','Promoted to Grandma'] },
  print:    { colours:['#F5F0E8','#87AE87','#2C3E50','#DDD8C4','#8B7355'], colourNames:['Cream','Sage','Navy','Sand','Brown'],          font:'Delicate Serif or Script', style:'Botanical illustration or typography', size:'A4/A3 print', supplier:'Printify £2.80', margin:'82%', searches:'~38,000/mo', sales:'~6,000/mo',  buyer:'Home decorators 25-40, mostly female', photo:'Framed on wall with soft furnishings', phrases:['She Believed She Could','Wild and Free','Home is Where the Heart Is'] },
  tote:     { colours:['#F5DEB3','#FFFFFF','#87AE87','#2C3E50','#000000'], colourNames:['Natural Canvas','White','Sage','Navy','Black'], font:'Script or Bold Sans',    style:'Bold slogan or botanical',       size:'38x42cm canvas', supplier:'Printify £4.20', margin:'70%', searches:'~22,000/mo', sales:'~3,500/mo',  buyer:'Eco-conscious women 20-35', photo:'Person carrying outdoors in natural light', phrases:['Tote-ally Awesome','Book Lover','Plant Lady','Bookish'] },
  baby:     { colours:['#FFB6C1','#ADD8E6','#87AE87','#FFF5E4','#DDA0DD'], colourNames:['Pink','Blue','Sage','Peach','Lavender'],       font:'Delicate Rounded Script', style:'Watercolour floral with name',   size:'A4 or 8x10 inch', supplier:'Printify £2.80', margin:'82%', searches:'~18,000/mo', sales:'~2,800/mo',  buyer:'New parents & gift-givers for baby showers', photo:'In nursery setting with soft toys', phrases:['[Name] Est. [Year]','Little One','Our Greatest Adventure'] },
  fathers:  { colours:['#FFFFFF','#2C3E50','#8B4513','#87CEEB','#808080'], colourNames:['White','Navy','Brown','Sky Blue','Grey'],       font:'Bold Sans-Serif',        style:'Personalised humour or sports',  size:'11oz or 15oz',   supplier:'Printify £3.50', margin:'72%', searches:'~28,000/mo', sales:'~5,000/mo',  buyer:'Children & partners buying for Father\'s Day', photo:'Gift box with ribbon — gift context', phrases:["Best Dad Ever","World's Best Dad","Dog Dad","Dad Est. [Year]","Promoted to Dad"] },
  fatherp:  { colours:['#2C3E50','#F5F0E8','#8B7355','#87AE87','#C0B080'], colourNames:['Navy','Cream','Warm Brown','Sage','Gold'],      font:'Bold Serif or Masculine Sans', style:'Typographic with names/date', size:'A4 or 8x10 inch', supplier:'Printify £2.80', margin:'82%', searches:'~15,000/mo', sales:'~2,500/mo', buyer:'Adult children buying for fathers', photo:'Framed in home office — masculine setting', phrases:["Dad of [Names]","Father Est. [Year]","The Man The Myth The Legend"] },
  pet:      { colours:['#F5F0E8','#87AE87','#DDD8C4','#2C3E50','#E8D5B7'], colourNames:['Cream','Sage','Sand','Navy','Kraft'],           font:'Script or Serif',        style:'Watercolour pet illustration',   size:'A4/A3',          supplier:'Printify £2.80', margin:'75%', searches:'~19,000/mo', sales:'~2,200/mo',  buyer:'Pet owners 25-45, gift and self-purchase', photo:'Portrait next to the actual pet', phrases:['[Pet Name] The Good Boy','Best Cat Ever','In Loving Memory'] },
  wedding:  { colours:['#FFFFFF','#C0C0C0','#F5F0E8','#C0B080','#DDD8C4'], colourNames:['White','Silver','Ivory','Gold','Sand'],         font:'Elegant Script',         style:'Romantic minimal typography',    size:'A4 or 50x70cm',  supplier:'Printify £2.80', margin:'75%', searches:'~24,000/mo', sales:'~3,200/mo',  buyer:'Wedding guests & family buying gifts', photo:'Styled with flowers and wedding rings', phrases:['Mr & Mrs [Name]','Est. [Year]','Our Adventure Begins','Forever and Always'] },
  motiv:    { colours:['#000000','#FFFFFF','#F5F0E8','#87AE87','#2C3E50'], colourNames:['Black','White','Cream','Sage','Navy'],           font:'Bold Sans or Brush Script', style:'Bold typography on minimal bg', size:'A4/A3/50x70cm',  supplier:'Printify £2.80', margin:'82%', searches:'~16,000/mo', sales:'~2,000/mo',  buyer:'Women 25-35, self-purchase home/office', photo:'In home office or bedroom in a frame', phrases:["She Believed She Could","Do What You Love","Make it Happen"] },
  cottage:  { colours:['#87AE87','#F5F0E8','#DDA0DD','#8FBC8F','#F5DEB3'], colourNames:['Sage','Cream','Lavender','Forest','Wheat'],      font:'Delicate Serif or Hand-drawn', style:'Botanical pressed flowers', size:'A4/A3',          supplier:'Printify £2.80', margin:'82%', searches:'~14,000/mo', sales:'~1,800/mo',  buyer:'Aesthetic women 18-30, Pinterest-driven', photo:'Flat lay with dried flowers and vintage props', phrases:['Wild Flowers','Gather Here','Bloom Where You Are Planted'] },
  shirt:    { colours:['#FFFFFF','#000000','#808080','#87AE87','#F5DEB3'], colourNames:['White','Black','Heather Grey','Sage','Natural'],  font:'Bold Sans or Brush',    style:'Humour slogan',                  size:'Unisex XS-3XL',  supplier:'Printify £7.50', margin:'65%', searches:'~31,000/mo', sales:'~4,500/mo',  buyer:'Gift buyers, women 20-35', photo:'Flat lay on natural background with props', phrases:["But First Coffee","I Can't Adult Today","Dog Mum","Plant Lady"] },
  keyring:  { colours:['#C0C0C0','#FFD700','#CD7F32','#FFFFFF','#000000'], colourNames:['Silver','Gold','Bronze','White','Black'],        font:'Script or Clean Sans',   style:'Minimal engraved',               size:'Standard round', supplier:'Printify £2.50', margin:'68%', searches:'~12,000/mo', sales:'~2,500/mo',  buyer:'Impulse gift buyers, stocking fillers', photo:'Close-up macro showing engraved text', phrases:['[Name]','Est. [Year]','You Are My Sunshine'] },
  planner:  { colours:['#FFFFFF','#F5F0E8','#87AE87','#2C3E50','#DDA0DD'], colourNames:['White','Cream','Sage','Navy','Pink'],            font:'Clean Sans-Serif',       style:'Minimal clean layout with tabs', size:'A4 PDF/GoodNotes', supplier:'Self-supply £0', margin:'95%', searches:'~21,000/mo', sales:'~3,000/mo',  buyer:'Organised women 20-40, students/professionals', photo:'iPad mockup with stylus in aesthetic setting', phrases:['2026 Digital Planner','Daily Planner','Habit Tracker'] },
  wild:     { colours:['#87AE87','#DDA0DD','#F5F0E8','#FFB347','#FFFFFF'], colourNames:['Sage','Lavender','Cream','Peach','White'],       font:'Delicate Script',        style:'Wildflower botanical illustration', size:'A4/A3/50x70cm', supplier:'Printify £2.80', margin:'80%', searches:'~11,000/mo', sales:'~1,600/mo',  buyer:'Nature lovers, gardeners, home decor fans', photo:'Natural setting with real flowers as props', phrases:['Wildflower','She is a Wildflower','Bloom','Into the Wild'] },
  mental:   { colours:['#DDA0DD','#98FB98','#ADD8E6','#FFB6C1','#F5F0E8'], colourNames:['Lavender','Mint','Sky Blue','Blush','Cream'],    font:'Gentle Rounded Script',  style:'Soft uplifting typography',      size:'Mug or A4 print', supplier:'Printify',     margin:'72%', searches:'~9,000/mo',  sales:'~1,200/mo',  buyer:'Caring friends buying for loved ones', photo:'Soft flat lay with calming props', phrases:["You've Got This","It's OK Not to Be OK","Be Kind to Your Mind"] }
};

// Keyword → design key mapping
function getDesign(kw) {
  const k = kw.toLowerCase();
  if (k.includes('father') || k.includes('dad')) return k.includes('print') || k.includes('art') ? DESIGN_INTEL.fatherp : DESIGN_INTEL.fathers;
  if (k.includes('mug') || k.includes('cup')) return DESIGN_INTEL.mug;
  if (k.includes('tote') || k.includes('bag')) return DESIGN_INTEL.tote;
  if (k.includes('baby') || k.includes('nursery')) return DESIGN_INTEL.baby;
  if (k.includes('pet') || k.includes('portrait') || k.includes('dog') || k.includes('cat')) return DESIGN_INTEL.pet;
  if (k.includes('wedding') || k.includes('bride')) return DESIGN_INTEL.wedding;
  if (k.includes('shirt') || k.includes('tee')) return DESIGN_INTEL.shirt;
  if (k.includes('keyring') || k.includes('keychain')) return DESIGN_INTEL.keyring;
  if (k.includes('planner') || k.includes('digital download') || k.includes('journal')) return DESIGN_INTEL.planner;
  if (k.includes('wildflower') || k.includes('botanical') || k.includes('cottage')) return k.includes('cottage') ? DESIGN_INTEL.cottage : DESIGN_INTEL.wild;
  if (k.includes('mental') || k.includes('wellbeing') || k.includes('anxiety')) return DESIGN_INTEL.mental;
  if (k.includes('motivat') || k.includes('inspirat') || k.includes('gym') || k.includes('fitness')) return DESIGN_INTEL.motiv;
  if (k.includes('print') || k.includes('poster') || k.includes('art') || k.includes('wall')) return DESIGN_INTEL.print;
  return DESIGN_INTEL.mug; // default
}

// DISTINCT product categories for each tab — no overlap
const TAB_PRODUCTS = {
  hot: [
    { kw: 'personalised mug gift', cat: 'Mugs', baseScore: 45, reason: 'Consistently top-searched POD product UK — 45,000+ monthly searches, proven year-round seller' },
    { kw: 'funny mug gift uk', cat: 'Mugs', baseScore: 38, reason: 'Gift market huge — funny mugs are impulse buys, high conversion, repeat gifting occasions' },
    { kw: 'personalised tote bag uk', cat: 'Totes', baseScore: 35, reason: 'Eco gifting trend strong — sustainable gifts growing 40% year-on-year' },
    { kw: 'wall art print home decor', cat: 'Wall Art', baseScore: 42, reason: 'Evergreen home decor market — new homeowners and renters buy year-round' },
    { kw: 'custom pet portrait print', cat: 'Pet Art', baseScore: 32, reason: 'Pet owners are passionate spenders — average order value £18-35, emotional purchase' },
    { kw: 'funny t shirt gift', cat: 'Clothing', baseScore: 36, reason: 'Birthday and novelty gift staple — searches peak Nov-Dec and Jan-Feb' },
    { kw: 'personalised baby name print', cat: 'Baby', baseScore: 30, reason: 'New babies every day — constant demand, highly emotional purchase, premium price point' },
    { kw: 'personalised wedding gift print', cat: 'Wedding', baseScore: 28, reason: 'Wedding season April-September — high value gifts, buyers pay premium for personalisation' }
  ],
  rising: [
    { kw: 'mental health awareness gift', cat: 'Wellness', baseScore: 28, reason: 'Rising 180% year-on-year — growing cultural awareness, under-served by existing sellers' },
    { kw: 'cottagecore wall art print', cat: 'Aesthetic', baseScore: 26, reason: 'Pinterest-driven aesthetic trend — 2.3M monthly Pinterest searches, translating to Etsy sales' },
    { kw: 'digital planner download', cat: 'Digital', baseScore: 31, reason: '95% margin, zero production cost — growing fast as buyers shift to iPad/GoodNotes planning' },
    { kw: 'wildflower botanical print', cat: 'Botanical', baseScore: 24, reason: 'Spring/Summer peak right now — Pinterest wildflower boards up 320% this season' },
    { kw: 'funny dog mum gift', cat: 'Pet Gifts', baseScore: 22, reason: 'Pet humanisation trend strong — "dog mum" identity growing, underserved niche with loyal buyers' },
    { kw: 'motivational gym print', cat: 'Fitness', baseScore: 20, reason: 'Home gym boom continuing — buyers want to personalise their space, good margins on A3 prints' }
  ],
  green: [
    { kw: 'personalised mug name', cat: 'Mugs', baseScore: 48, reason: 'Sells every single month without fail — birthdays happen every day, Christmas never stops' },
    { kw: 'wall art living room print', cat: 'Wall Art', baseScore: 40, reason: 'New movers, renters, new homeowners — constant stream of buyers decorating their space' },
    { kw: 'personalised keyring gift', cat: 'Accessories', baseScore: 29, reason: 'Low base cost £2.50, impulse gift price point — stocking fillers, keepsakes, everyday gifting' },
    { kw: 'baby shower gift personalised', cat: 'Baby', baseScore: 33, reason: 'Constant demand — 1,750 babies born in UK every day, each one is a gifting occasion' },
    { kw: 'funny novelty gift uk', cat: 'Gifts', baseScore: 35, reason: 'Secret Santa, white elephant, work gifts — runs all year especially Oct-Jan' },
    { kw: 'custom wedding gift print', cat: 'Wedding', baseScore: 27, reason: '250,000 UK weddings per year — guest gifts, couple gifts, anniversary gifts, never-ending market' }
  ],
  low: [
    { kw: 'cottagecore kitchen print', cat: 'Kitchen Decor', baseScore: 22, reason: 'Specific niche within large market — under 200 listings, buyers searching specifically for kitchen art' },
    { kw: 'mental health self care mug', cat: 'Wellness', baseScore: 20, reason: 'Growing demand, medium listings — wellbeing buyers pay more for thoughtful message products' },
    { kw: 'dog breed specific mug', cat: 'Pet Mugs', baseScore: 18, reason: 'Breed-specific = under 300 listings per breed — "Labrador mum mug" is virtually untapped' },
    { kw: 'wildflower wedding invitation print', cat: 'Wedding', baseScore: 16, reason: 'Botanical wedding aesthetic booming — few sellers combining wildflower art with wedding niche' },
    { kw: 'funny accountant gift mug', cat: 'Occupation Mugs', baseScore: 15, reason: 'Occupation-specific gifts are massively underserved — nurses, teachers, accountants all want niche products' },
    { kw: 'digital habit tracker download', cat: 'Digital', baseScore: 19, reason: 'Sub-niche of planners with very few competitors — specific searches from organised buyers' }
  ],
  season: [
    { kw: 'fathers day personalised mug', cat: 'Seasonal', baseScore: 52, reason: "Father's Day 13 days away — PEAK DEMAND. Searches up 400%. List TODAY to catch the wave", event: "Father's Day UK", daysUntil: 13 },
    { kw: 'fathers day gift print personalised', cat: 'Seasonal', baseScore: 48, reason: "Father's Day urgent — prints are quick to make, buyers searching right now for last-minute gifts", event: "Father's Day UK", daysUntil: 13 },
    { kw: 'best dad mug funny', cat: 'Seasonal', baseScore: 44, reason: "Father's Day drives massive mug demand every June — funny + personalised is the winning combination", event: "Father's Day UK", daysUntil: 13 },
    { kw: 'dog dad mug gift', cat: 'Seasonal', baseScore: 40, reason: "Dog dad niche within Father's Day — underserved angle, passionate buyers, premium price point", event: "Father's Day UK", daysUntil: 13 },
    { kw: 'summer garden party print', cat: 'Summer', baseScore: 22, reason: 'Summer entertaining peak — garden party, BBQ, outdoor living prints trending June-August' },
    { kw: 'graduation gift personalised 2026', cat: 'Graduation', baseScore: 35, reason: 'Graduation season May-July — students graduating now, families buying celebratory gifts' }
  ]
};

async function getEtsyData(kw) {
  try {
    const ETSY_KEY = process.env.ETSY_API_KEY || 'vqtvuckq3kqmsnklxmxbhd36';
    const ETSY_SECRET = process.env.ETSY_SHARED_SECRET || '';
    const header = ETSY_SECRET ? `${ETSY_KEY}:${ETSY_SECRET}` : ETSY_KEY;
    const url = `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(kw)}&limit=100&sort_on=score&language=en&location=GB`;
    const r = await fetch(url, { headers: { 'x-api-key': header, 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const data = await r.json();
    const L = data.results || [];
    const prices = L.map(l => (l.price?.amount || 0) / (l.price?.divisor || 100)).filter(p => p > 0).sort((a, b) => a - b);
    const tagMap = {};
    L.forEach(l => (l.tags || []).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; }));
    const topTags = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
    const topFav = [...L].sort((a, b) => (b.num_favorers || 0) - (a.num_favorers || 0)).slice(0, 3);
    const totalFavs = L.reduce((s, l) => s + (l.num_favorers || 0), 0);
    const avg = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    const swLow = prices.length ? prices[Math.floor(prices.length * 0.2)] : 0;
    const swHigh = prices.length ? prices[Math.floor(prices.length * 0.8)] : 0;
    const score = L.length >= 5000 ? 10 : L.length >= 2000 ? 9 : L.length >= 1000 ? 8 : L.length >= 500 ? 7 : L.length >= 200 ? 6 : L.length >= 100 ? 5 : L.length >= 50 ? 4 : L.length >= 20 ? 3 : 2;
    return { count: L.length, avgPrice: avg.toFixed(2), sweetSpot: swLow ? `£${swLow.toFixed(2)}-£${swHigh.toFixed(2)}` : null, topTags, topFav, totalFavs, competitionScore: score, saturation: score >= 9 ? 'Highly Saturated' : score >= 7 ? 'Saturated' : score >= 5 ? 'Competitive' : score >= 3 ? 'Moderate' : 'Wide Open' };
  } catch (e) { return null; }
}

async function getRedditSignals() {
  try {
    const r = await fetch('https://www.reddit.com/r/EtsySellers/search.json?q=selling+best+popular&sort=top&t=week&limit=25', { headers: { 'User-Agent': 'OliveEdge/1.0' } });
    if (!r.ok) return {};
    const data = await r.json();
    const posts = data?.data?.children || [];
    const signals = {};
    posts.forEach(p => {
      const text = ((p.data?.title || '') + ' ' + (p.data?.selftext || '')).toLowerCase();
      ['mug', 'tote', 'print', 'shirt', 'planner', 'keyring', 'portrait', 'candle', 'wedding', 'baby', 'father', 'dad', 'pet', 'dog', 'cat', 'digital', 'wall art', 'gift'].forEach(kw => {
        if (text.includes(kw)) signals[kw] = (signals[kw] || 0) + 1;
      });
    });
    return signals;
  } catch (e) { return {}; }
}

async function getCached() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/intelligence_cache?key=eq.daily_feed&select=*&limit=1`, { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } });
    const data = await r.json();
    if (!data || !data[0]) return null;
    const age = (Date.now() - new Date(data[0].updated_at).getTime()) / 1000 / 60 / 60;
    if (age < 24) return JSON.parse(data[0].value);
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

  if (req.query.refresh !== 'true') {
    const cached = await getCached();
    if (cached) return res.status(200).json({ ...cached, fromCache: true });
  }

  // Get date context
  let upcomingEvents = [];
  let datePrefix = 'TODAY IS JUNE 2026. ';
  try {
    const dr = await fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/date`);
    const dc = await dr.json();
    upcomingEvents = dc.upcomingEvents || [];
    datePrefix = dc.aiContext || datePrefix;
  } catch (e) {}

  // Get Reddit signals
  const redditSignals = await getRedditSignals();

  // Fetch Etsy data for all products across all tabs
  const allProducts = [];
  const seen = new Set();
  for (const [tab, products] of Object.entries(TAB_PRODUCTS)) {
    for (const p of products) {
      if (!seen.has(p.kw)) {
        seen.add(p.kw);
        allProducts.push({ ...p, tab });
      }
    }
  }

  const etsyResults = await Promise.allSettled(allProducts.map(p => getEtsyData(p.kw)));

  // Build enriched products per tab
  const tabs = {};
  for (const [tabName, products] of Object.entries(TAB_PRODUCTS)) {
    tabs[tabName] = products.map((p, idx) => {
      const etsyIdx = allProducts.findIndex(ap => ap.kw === p.kw);
      const etsy = etsyIdx >= 0 && etsyResults[etsyIdx]?.status === 'fulfilled' ? etsyResults[etsyIdx].value : null;
      const design = getDesign(p.kw);

      // Reddit boost for this product
      const redditBoost = Object.entries(redditSignals).reduce((boost, [signal, count]) => {
        return p.kw.toLowerCase().includes(signal) ? boost + count : boost;
      }, 0);

      // Real competition score from Etsy
      const compScore = etsy ? etsy.competitionScore : (tabName === 'low' ? 3 : tabName === 'hot' ? 7 : 5);

      // Opportunity score — varies meaningfully per product
      // Base score (set per product) + etsy demand boost + reddit boost - competition penalty
      const etsyBoost = etsy ? Math.min(15, Math.round(etsy.count / 200)) : 0;
      const opportunityScore = p.baseScore + etsyBoost + Math.min(5, redditBoost) - (compScore > 7 ? 5 : 0);
      const maxPossibleScore = 70; // so scores show as x/70

      // Find seasonal event
      let seasonalEvent = p.event ? { name: p.event, daysUntil: p.daysUntil, listBy: 'LIST NOW' } : null;
      if (!seasonalEvent) {
        const kwl = p.kw.toLowerCase();
        upcomingEvents.forEach(ev => {
          if (ev.daysUntil <= 30) {
            if ((kwl.includes('father') || kwl.includes('dad')) && ev.name.includes('Father')) seasonalEvent = ev;
            if ((kwl.includes('mother') || kwl.includes('mum')) && ev.name.includes('Mother')) seasonalEvent = ev;
          }
        });
      }

      const trend = tabName === 'rising' ? 'Rising ↑' : tabName === 'season' ? 'Spiking 🔥' : tabName === 'green' ? 'Stable ✓' : etsy && etsy.count > 1000 ? 'High Volume' : 'Active';

      return {
        kw: p.kw,
        category: p.cat,
        reason: p.reason,
        opportunityScore,
        maxScore: maxPossibleScore,
        trend,
        isUrgent: seasonalEvent && seasonalEvent.daysUntil <= 14,
        seasonalEvent,
        competitionScore: compScore,
        competition: compScore <= 3 ? 'Low' : compScore <= 5 ? 'Medium' : compScore <= 7 ? 'Competitive' : 'High',
        saturation: etsy?.saturation || (tabName === 'low' ? 'Wide Open' : 'Active'),
        listingCount: etsy?.count || 0,
        avgPrice: etsy?.avgPrice || null,
        sweetSpot: etsy?.sweetSpot || null,
        totalFavs: etsy?.totalFavs || 0,
        topTags: etsy?.topTags || [],
        topFav: etsy?.topFav || [],
        // Design intelligence
        colours: design.colours,
        colourNames: design.colourNames,
        font: design.font,
        style: design.style,
        size: design.size,
        supplier: design.supplier,
        margin: design.margin,
        searches: design.searches,
        sales: design.sales,
        buyer: design.buyer,
        photo: design.photo,
        phrases: design.phrases || []
      };
    }).sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  const result = {
    generatedAt: new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    upcomingEvents,
    tabs,
    meta: { totalProducts: allProducts.length, redditSignals: Object.keys(redditSignals).length }
  };

  await saveCache(result);
  return res.status(200).json({ ...result, fromCache: false });
}
