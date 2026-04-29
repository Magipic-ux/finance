// Vercel serverless proxy — bypasses CORS on Sumit API
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId, apiKey, page = 1 } = req.body || {};
  if (!companyId || !apiKey) return res.status(400).json({ error: 'Missing companyId or apiKey' });

  const upstream = await fetch('https://api.sumit.co.il/accounting/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Credentials: { CompanyID: companyId, APIKey: apiKey }, Page: page, ResultsPerPage: 100 })
  });
  const data = await upstream.json();
  res.status(upstream.status).json(data);
}
