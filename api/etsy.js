// /api/etsy.js
// Handles Etsy Personal Access keys (keystring:sharedsecret in header)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ETSY_KEY    = process.env.ETSY_API_KEY       || 'vqtvuckq3kqmsnklxmxbhd36';
  const ETSY_SECRET = process.env.ETSY_SHARED_SECRET || '';
  const { path } = req.query;

  if (!path) return res.status(400).json({ error: 'Missing path parameter' });

  try {
    const url = `https://openapi.etsy.com/v3/application/${path}`;

    // Personal Access format: "keystring:sharedsecret" in x-api-key header
    const apiKeyHeader = ETSY_SECRET ? `${ETSY_KEY}:${ETSY_SECRET}` : ETSY_KEY;

    const response = await fetch(url, {
      headers: { 'x-api-key': apiKeyHeader, 'Accept': 'application/json' }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error || 'Etsy API error',
        status: response.status
      });
    }

    if (data.results && Array.isArray(data.results)) {
      const listings = data.results;
      const prices = listings
        .map(l => (l.price?.amount || 0) / (l.price?.divisor || 100))
        .filter(p => p > 0).sort((a, b) => a - b);
      const tagMap = {};
      listings.forEach(l => { (l.tags || []).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; }); });
      const topTags = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }));
      const priceAnalytics = prices.length ? {
        min: prices[0].toFixed(2),
        max: prices[prices.length - 1].toFixed(2),
        avg: (prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2),
        median: prices[Math.floor(prices.length / 2)].toFixed(2),
        sweetSpot: `£${prices[Math.floor(prices.length * 0.25)].toFixed(2)}-£${prices[Math.floor(prices.length * 0.75)].toFixed(2)}`,
        count: prices.length
      } : null;
      const competitionScore = Math.min(10, Math.max(1,
        listings.length >= 5000 ? 10 : listings.length >= 2000 ? 9 : listings.length >= 1000 ? 8 :
        listings.length >= 500 ? 7 : listings.length >= 200 ? 6 : listings.length >= 100 ? 5 :
        listings.length >= 50 ? 4 : listings.length >= 20 ? 3 : listings.length >= 5 ? 2 : 1
      ));
      return res.status(200).json({
        ...data,
        _enriched: {
          listingCount: listings.length,
          priceAnalytics,
          topTags,
          competitionScore,
          saturationLabel: competitionScore >= 9 ? 'Highly Saturated' : competitionScore >= 7 ? 'Saturated' : competitionScore >= 5 ? 'Competitive' : competitionScore >= 3 ? 'Moderate' : 'Wide Open',
          pulledAt: new Date().toISOString(),
          pulledAtHuman: new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        }
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
