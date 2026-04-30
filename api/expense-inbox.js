// Vercel serverless — expense inbox for Make.com → Dashboard sync
// Stores pending expenses in Vercel KV (Upstash Redis) until dashboard imports them
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(503).json({
      error: 'Vercel KV not configured',
      hint: 'Go to Vercel Dashboard → Storage → Create Database → KV, then link it to this project'
    });
  }

  const KEY = 'expense_inbox';

  // Execute a single Redis command via Upstash REST API
  async function kvCmd(args) {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    const j = await r.json();
    if (j.error) throw new Error('KV error: ' + j.error);
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
  if (req.method === 'POST') {
    const expense = req.body || {};
    const inbox = await getInbox();
    inbox.push({
      vendor:   expense.vendor   || expense.Vendor   || 'Unknown',
      amount:   parseFloat(expense.amount   || expense.Amount   || 0),
      currency: expense.currency || expense.Currency || 'USD',
      date:     expense.date     || expense.Date     || new Date().toISOString().split('T')[0],
      category: expense.category || expense.Category || 'Other',
      notes:    expense.notes    || expense.description || expense.Description || '',
      receipt:  expense.receipt  || expense.fileName || '',
      _id:          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      _receivedAt:  new Date().toISOString()
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
