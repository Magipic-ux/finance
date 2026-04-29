// Vercel serverless proxy — bypasses CORS on Sumit API
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId, apiKey, page = 1 } = req.body || {};
  if (!companyId || !apiKey) return res.status(400).json({ error: 'Missing companyId or apiKey' });

  // Try the correct Sumit endpoints (all require trailing slash per their docs)
  const endpoints = [
    'https://api.sumit.co.il/accounting/documents/getdetails/',
    'https://api.sumit.co.il/accounting/documents/',
    'https://api.sumit.co.il/accounting/documents/search/',
  ];

  const now = new Date();
  const fromDate = `${now.getFullYear()}-01-01`;
  const toDate   = `${now.getFullYear()}-12-31`;

  const body = {
    Credentials: { CompanyID: companyId, APIKey: apiKey },
    Parameters: {
      DateType: 1,
      FromDate: fromDate,
      ToDate:   toDate,
      Types: [320, 305, 330, 400, 100, 200]   // invoices, receipts, credit notes
    },
    Page: page,
    ResultsPerPage: 100
  };

  for (const url of endpoints) {
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const text = await upstream.text();

      if (!text || !text.trim()) continue; // empty — try next

      // Detect HTML (web page served instead of API)
      if (text.trim().startsWith('<')) {
        if (url === endpoints[endpoints.length - 1]) {
          return res.status(502).json({ error: 'All endpoints returned HTML, not JSON. Check Sumit API docs for the correct URL.', tried: endpoints });
        }
        continue;
      }

      let data;
      try { data = JSON.parse(text); }
      catch (e) {
        if (url === endpoints[endpoints.length - 1]) {
          return res.status(502).json({ error: 'Non-JSON response from Sumit', rawText: text.slice(0, 300) });
        }
        continue;
      }

      // Success — include which endpoint worked
      return res.status(upstream.status).json({ ...data, _endpoint: url });

    } catch (e) {
      if (url === endpoints[endpoints.length - 1]) {
        return res.status(500).json({ error: 'Proxy fetch failed: ' + e.message });
      }
    }
  }

  return res.status(502).json({ error: 'No working Sumit endpoint found', tried: endpoints });
}
