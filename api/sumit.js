// Vercel serverless proxy — bypasses CORS on Sumit API
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId, apiKey, page = 1 } = req.body || {};
  if (!companyId || !apiKey) return res.status(400).json({ error: 'Missing companyId or apiKey' });

  try {
    const upstream = await fetch('https://api.sumit.co.il/accounting/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Credentials: { CompanyID: companyId, APIKey: apiKey }, Page: page, ResultsPerPage: 100 })
    });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) { return res.status(502).json({ error: 'Sumit returned non-JSON', raw: text.slice(0, 300) }); }
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy fetch failed: ' + e.message });
  }
}
