// Vercel serverless proxy — bypasses CORS on Sumit API
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId, apiKey, page = 1 } = req.body || {};
  if (!companyId || !apiKey) return res.status(400).json({ error: 'Missing companyId or apiKey' });

  // Try multiple known Sumit endpoint variations
  const endpoints = [
    'https://api.sumit.co.il/accounting/documents',
    'https://api.sumit.co.il/v2/accounting/documents',
    'https://api.sumit.co.il/invoicing/documents',
  ];

  for (const url of endpoints) {
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Credentials: { CompanyID: companyId, APIKey: apiKey }, Page: page, ResultsPerPage: 100 })
      });
      const text = await upstream.text();
      if (!text.trim()) {
        // Empty body — record status and try next endpoint
        if (url === endpoints[endpoints.length - 1]) {
          return res.status(502).json({ error: `All endpoints returned empty body. Last HTTP status: ${upstream.status}`, endpoint: url });
        }
        continue;
      }
      let data;
      try { data = JSON.parse(text); }
      catch (e) {
        return res.status(502).json({
          error: `Sumit returned non-JSON (HTTP ${upstream.status})`,
          endpoint: url,
          raw: text.slice(0, 500)
        });
      }
      // Got valid JSON — return it with which endpoint worked
      return res.status(upstream.status).json({ ...data, _endpoint: url });
    } catch (e) {
      if (url === endpoints[endpoints.length - 1]) {
        return res.status(500).json({ error: 'Proxy fetch failed: ' + e.message });
      }
    }
  }
}
