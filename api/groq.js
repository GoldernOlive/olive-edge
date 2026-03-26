// api/groq.js — Vercel serverless function
// Proxies Groq AI calls, keeps key secret on server

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'Groq API key not configured' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert Etsy market analyst. You specialise in print-on-demand, Etsy SEO, global selling across UK, USA, Canada, Australia, Germany, France. You analyse real Etsy data and give specific, accurate, actionable intelligence. Never be vague. Always give concrete numbers and specific recommendations.'
          },
          {
            role: 'user',
            content: prompt + '\n\nReturn ONLY valid raw JSON. No markdown, no code fences, no explanation. Start with { and end with }'
          }
        ],
        temperature: 0.2,
        max_tokens: 2048
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    const text = data.choices?.[0]?.message?.content || '';
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s < 0 || e < 0) return res.status(500).json({ error: 'No JSON in AI response' });
    return res.status(200).json(JSON.parse(text.slice(s, e+1)));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
