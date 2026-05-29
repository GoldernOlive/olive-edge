// /api/alerts.js
// Alert system — users save keywords, get emailed when they spike
// Phase 4 feature — the moat nobody else has

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SB_URL = process.env.SUPABASE_URL || 'https://oktpizrevqehfrkcqphq.supabase.co';
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || 'sb_publishable_r4lLwwInTT76wXjP-Cha4Q_T1yALqyt';

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' });

  // POST — save a new alert
  if (req.method === 'POST') {
    const { keyword, userId, email, alertType = 'spike' } = req.body;
    if (!keyword || !userId) return res.status(400).json({ error: 'keyword and userId required' });

    try {
      const r = await fetch(`${SB_URL}/rest/v1/keyword_alerts`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          keyword: keyword.toLowerCase(),
          user_id: userId,
          email,
          alert_type: alertType,
          active: true,
          created_at: new Date().toISOString()
        })
      });
      const data = await r.json();
      return res.status(200).json({ saved: true, alert: data });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET — get all alerts for a user
  if (req.method === 'GET') {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/keyword_alerts?user_id=eq.${userId}&active=eq.true&order=created_at.desc`,
        { headers: { 'apikey': SB_KEY, 'Authorization': authHeader } }
      );
      const alerts = await r.json();
      return res.status(200).json({ alerts: alerts || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE — remove an alert
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    try {
      await fetch(`${SB_URL}/rest/v1/keyword_alerts?id=eq.${id}`, {
        method: 'DELETE',
        headers: { 'apikey': SB_KEY, 'Authorization': authHeader }
      });
      return res.status(200).json({ deleted: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
