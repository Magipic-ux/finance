// Vercel serverless proxy — bypasses CORS on Sumit API
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId, apiKey, page = 1 } = req.body || {};
  if (!companyId || !apiKey) return res.status(400).json({ error: 'Missing companyId or apiKey' });

  const now = new Date();
  const dateFrom = new Date(now.getFullYear(), 0, 1).toISOString(); // Jan 1 this year
  const dateTo   = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString(); // Dec 31 this year

  const body = {
    Credentials: {
      CompanyID: parseInt(companyId, 10),
      APIKey: apiKey
    },
    // null = all document types; matches Sumit docs format
    DocumentTypes: null,
    DateFrom: dateFrom,
    DateTo:   dateTo,
    IncludeDrafts: false,
    Paging: null   // null = default paging
  };

  try {
    const upstream = await fetch('https://api.sumit.co.il/accounting/documents/list/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const text = await upstream.text();

    if (!text || !text.trim() || text.trim().startsWith('<')) {
      return res.status(502).json({
        error: `Sumit returned ${text.trim().startsWith('<') ? 'HTML page' : 'empty body'} (HTTP ${upstream.status})`,
        hint: 'Check Company ID and API Key in Settings'
      });
    }

    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      return res.status(502).json({ error: 'Sumit returned non-JSON', rawText: text.slice(0, 300) });
    }

    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Proxy fetch failed: ' + e.message });
  }
}
