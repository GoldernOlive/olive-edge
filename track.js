// /api/track.js
// Keyword velocity tracker — call this every time someone searches
// Stores daily snapshots so we can show 30/60/90 day trend curves
// This is the data backbone that makes Olive Edge truly unique

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = process.env.SUPABASE_URL || 'https://oktpizrevqehfrkcqphq.supabase.co';
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_r4lLwwInTT76wXjP-Cha4Q_T1yALqyt';
  const ETSY_KEY = process.env.ETSY_API_KEY || 'rr857rwlc24r9f535rezqqrq';

  // POST — record a keyword snapshot
  if (req.method === 'POST') {
    const { keyword, listingCount, avgPrice, topTags, userId } = req.body;
    if (!keyword) return res.status(400).json({ error: 'keyword required' });

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      // Check if we already have a snapshot for this keyword today
      const checkRes = await fetch(
        `${SB_URL}/rest/v1/keyword_snapshots?keyword=eq.${encodeURIComponent(keyword.toLowerCase())}&snapshot_date=eq.${today}&select=id`,
        { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
      );
      const existing = await checkRes.json();

      const snapshot = {
        keyword: keyword.toLowerCase(),
        snapshot_date: today,
        listing_count: listingCount || 0,
        avg_price: avgPrice ? parseFloat(avgPrice) : null,
        top_tags: JSON.stringify(topTags || []),
        updated_at: new Date().toISOString()
      };

      if (existing && existing.length > 0) {
        // Update existing snapshot
        await fetch(
          `${SB_URL}/rest/v1/keyword_snapshots?id=eq.${existing[0].id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SB_KEY,
              'Authorization': `Bearer ${SB_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(snapshot)
          }
        );
      } else {
        // Insert new snapshot
        await fetch(`${SB_URL}/rest/v1/keyword_snapshots`, {
          method: 'POST',
          headers: {
            'apikey': SB_KEY,
            'Authorization': `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(snapshot)
        });
      }

      return res.status(200).json({ saved: true, keyword, date: today });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET — retrieve velocity history for a keyword
  if (req.method === 'GET') {
    const { keyword, days = 90 } = req.query;
    if (!keyword) return res.status(400).json({ error: 'keyword required' });

    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));
    const sinceStr = since.toISOString().split('T')[0];

    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/keyword_snapshots?keyword=eq.${encodeURIComponent(keyword.toLowerCase())}&snapshot_date=gte.${sinceStr}&order=snapshot_date.asc&select=*`,
        { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
      );
      const snapshots = await r.json();

      if (!snapshots || !snapshots.length) {
        return res.status(200).json({
          keyword,
          snapshots: [],
          velocity: null,
          message: 'No historical data yet — will build up over time as users search'
        });
      }

      // Calculate velocity
      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1];
      const daysDiff = Math.max(1, (new Date(last.snapshot_date) - new Date(first.snapshot_date)) / (1000 * 60 * 60 * 24));
      
      const listingGrowth = last.listing_count - first.listing_count;
      const growthPct = first.listing_count > 0 ? 
        ((listingGrowth / first.listing_count) * 100).toFixed(1) : null;
      
      const dailyGrowthRate = (listingGrowth / daysDiff).toFixed(1);
      
      const velocityLabel = 
        listingGrowth > 500 ? 'Rapidly Saturating — act fast' :
        listingGrowth > 200 ? 'Growing Fast' :
        listingGrowth > 50  ? 'Steady Growth' :
        listingGrowth > 0   ? 'Slow Growth' :
        listingGrowth < -50 ? 'Declining — sellers leaving' :
        'Stable';

      return res.status(200).json({
        keyword,
        snapshots: snapshots.map(s => ({
          date: s.snapshot_date,
          listingCount: s.listing_count,
          avgPrice: s.avg_price
        })),
        velocity: {
          startCount: first.listing_count,
          currentCount: last.listing_count,
          change: listingGrowth,
          changePct: growthPct ? `${growthPct > 0 ? '+' : ''}${growthPct}%` : null,
          dailyGrowthRate: `${dailyGrowthRate > 0 ? '+' : ''}${dailyGrowthRate} listings/day`,
          label: velocityLabel,
          daysTracked: Math.round(daysDiff),
          dataPoints: snapshots.length
        }
      });

    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
