// Vercel serverless — expense inbox for Make.com → Dashboard sync
// Uses Vercel Redis (Upstash) via REST API derived from the REDIS_URL connection string
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Upstash Redis URL format: redis://default:TOKEN@HOST:PORT
  // The REST API lives at https://HOST with the same TOKEN as bearer auth
  const redisUrl = process.env.finance_inbox_REDIS_URL || '';
  const match = redisUrl.match(/^redis[s]?:\/\/[^:]*:([^@]+)@([^:/]+)/);
  if (!match) {
    return res.status(503).json({
      error: 'Redis not configured',
      hint: 'finance_inbox_REDIS_URL env var is missing or malformed',
      got: redisUrl ? 'set but unreadable' : 'not set'
    });
  }
  const REST_TOKEN = decodeURIComponent(match[1]);
  const REST_HOST  = match[2];
  const REST_URL   = `https://${REST_HOST}`;

  const KEY = 'expense_inbox';

  async function kvCmd(args) {
    let r, text;
    try {
      r = await fetch(REST_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      text = await r.text();
    } catch(e) {
      throw new Error('Fetch failed: ' + e.message + ' | REST_URL: ' + REST_URL);
    }
    let j;
    try { j = JSON.parse(text); } catch(e) {
      throw new Error('Non-JSON from Redis (' + r.status + '): ' + text.slice(0, 200));
    }
    if (j.error) throw new Error('Redis error: ' + j.error);
    return j.result;
  }

  async function getInbox() {
    const raw = await kvCmd(['GET', KEY]);
    return raw ? JSON.parse(raw) : [];
  }

  async function setInbox(list) {
    await kvCmd(['SET', KEY, JSON.stringify(list)]);
  }

  // POST — Make.com pushes an OCR-extracted expense here
  try { await kvCmd(['PING']); } catch(e) {
    return res.status(500).json({ error: 'Redis connection failed', detail: e.message });
  }

  if (req.method === 'POST') {
    const expense = req.body || {};
    const inbox = await getInbox();
    inbox.push({
      vendor:      expense.vendor      || expense.Vendor      || 'Unknown',
      amount:      parseFloat(expense.amount      || expense.Amount      || 0),
      currency:    expense.currency    || expense.Currency    || 'USD',
      date:        expense.date        || expense.Date        || new Date().toISOString().split('T')[0],
      category:    expense.category    || expense.Category    || 'Other',
      notes:       expense.notes       || expense.description || expense.Description || '',
      receipt:     expense.receipt     || expense.fileName    || '',
      _id:         `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      _receivedAt: new Date().toISOString()
    });
    await setInbox(inbox);
    return res.status(200).json({ ok: true, pending: inbox.length });
  }

  // GET — dashboard polls for pending expenses
  if (req.method === 'GET') {
    const inbox = await getInbox();
    return res.status(200).json({ expenses: inbox, count: inbox.length });
  }

  // DELETE — dashboard clears inbox after importing
  if (req.method === 'DELETE') {
    await setInbox([]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
