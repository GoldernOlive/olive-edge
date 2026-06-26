// Shared discovery primitives — used by gap-finder.js and the weekly cron

export const SEEDS = [
  'personalised mug gift uk', 'funny mug gift', 'novelty mug uk',
  'personalised print gift uk', 'wall art print uk',
  'personalised tote bag uk', 'funny t shirt gift uk',
  'gift for dog lover uk', 'gift for cat lover uk', 'gift for teacher uk',
  'gift for nurse uk', 'gift for dad uk', 'gift for mum uk',
  'fathers day gift uk', 'graduation gift uk',
  'cottagecore print uk', 'botanical print gift',
  'bookish gift uk', 'labrador gift uk', 'cockapoo gift uk'
];

export async function googleAutocomplete(seed) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}&hl=en-GB&gl=GB`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data[1] || []).slice(0, 8).map((s, i) => ({ kw: String(s).trim(), position: i + 1 }));
  } catch (e) { return []; }
}

export async function redditBuyerDemand() {
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
