// Vercel serverless — thin redirect wrapper kept for backwards compat
// Actual invoice data now lives in /api/invoice-inbox (Redis-backed)
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Forward to invoice-inbox
  const base = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['host']}`;
  try {
    if (req.method === 'PATCH') {
      const upstream = await fetch(`${base}/api/invoice-inbox`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {})
      });
      return res.status(upstream.status).json(await upstream.json());
    }
    const upstream = await fetch(`${base}/api/invoice-inbox`);
    return res.status(upstream.status).json(await upstream.json());
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
