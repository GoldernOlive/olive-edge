// api/etsy.js — Vercel serverless function
// Proxies Etsy API calls, keeps key secret on server

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ETSY_KEY = process.env.ETSY_API_KEY;
  if (!ETSY_KEY) return res.status(500).json({ error: 'Etsy API key not configured' });

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path' });

  try {
    const url = `https://openapi.etsy.com/v3/application/${path}`;
    const r = await fetch(url, {
      headers: { 'x-api-key': ETSY_KEY }
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
