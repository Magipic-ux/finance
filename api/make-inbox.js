// Vercel serverless proxy — bypasses CORS on Make.com data store API
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // API key forwarded as Authorization header from browser
  const authHeader = req.headers['authorization'] || '';
  const makeApiKey = authHeader.replace(/^Token\s+/i, '').trim();
  if (!makeApiKey) return res.status(400).json({ error: 'Missing Authorization header' });

  const BASE = 'https://eu2.make.com/api/v2/data-store-records';
  const STORE_QS = 'dataStoreId=160891&teamId=1766172&limit=100';

  try {
    // PATCH — update a record's status (e.g. mark paid)
    if (req.method === 'PATCH') {
      const { recordKey, status } = req.body || {};
      if (!recordKey) return res.status(400).json({ error: 'Missing recordKey' });
      const upstream = await fetch(`${BASE}/${encodeURIComponent(recordKey)}?${STORE_QS}`, {
        method: 'PATCH',
        headers: { Authorization: `Token ${makeApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { status: status || 'paid' } })
      });
      return res.status(upstream.status).json(await upstream.json());
    }

    // GET — fetch all records from data store
    const upstream = await fetch(`${BASE}?${STORE_QS}`, {
      headers: { Authorization: `Token ${makeApiKey}` }
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(upstream.status).json({ error: 'Make.com error', detail: text.slice(0, 200) });
    }
    const json = await upstream.json();
    // Make.com returns { dataStoreRecords: [...] } — normalise to { records: [...] }
    const raw = json.dataStoreRecords || json.records || [];
    return res.status(200).json({ records: raw, _raw: json });

  } catch (e) {
    return res.status(500).json({ error: 'Proxy error: ' + e.message });
  }
};
