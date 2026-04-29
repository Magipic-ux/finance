// Vercel serverless proxy — bypasses CORS on Sumit API
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId, apiKey, page = 1 } = req.body || {};
  if (!companyId || !apiKey) return res.status(400).json({ error: 'Missing companyId or apiKey' });

  const body = {
    Credentials: { CompanyID: companyId, APIKey: apiKey },
    Parameters: {},
    Page: page,
    ResultsPerPage: 100
  };

  try {
    const upstream = await fetch('https://api.sumit.co.il/accounting/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const text = await upstream.text();

    // Encode raw as base64 so non-printable chars (BOM, etc.) are visible
    const rawB64 = Buffer.from(text).toString('base64');
    const rawLen = text.length;

    if (!text.trim()) {
      return res.status(502).json({
        error: `Sumit returned empty body (HTTP ${upstream.status})`,
        rawLength: rawLen,
        rawBase64: rawB64
      });
    }

    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      return res.status(502).json({
        error: `Sumit returned non-JSON (HTTP ${upstream.status})`,
        rawLength: rawLen,
        rawBase64: rawB64,
        rawText: text.slice(0, 200)
      });
    }

    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Proxy fetch failed: ' + e.message });
  }
}
