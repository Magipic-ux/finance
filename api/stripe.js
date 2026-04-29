// Vercel serverless proxy — bypasses CORS on Stripe API
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { stripeKey, month } = req.body || {};
  if (!stripeKey) return res.status(400).json({ error: 'Missing stripeKey' });

  // Calculate unix timestamps for the requested month (default: current month)
  const target = month || new Date().toISOString().slice(0, 7); // e.g. "2026-04"
  const [yr, mo] = target.split('-').map(Number);
  const gte = Math.floor(new Date(yr, mo - 1, 1).getTime() / 1000);
  const lte = Math.floor(new Date(yr, mo, 0, 23, 59, 59).getTime() / 1000);

  try {
    const url = `https://api.stripe.com/v1/charges?created[gte]=${gte}&created[lte]=${lte}&limit=100&expand[]=data.customer`;
    const upstream = await fetch(url, {
      headers: { 'Authorization': `Bearer ${stripeKey}` }
    });
    const text = await upstream.text();
    if (!text || !text.trim()) {
      return res.status(502).json({ error: 'Stripe returned empty response' });
    }
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      return res.status(502).json({ error: 'Stripe returned non-JSON', raw: text.slice(0, 200) });
    }
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Proxy fetch failed: ' + e.message });
  }
};
