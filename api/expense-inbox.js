// Vercel serverless — expense inbox for Make.com → Dashboard sync
// Uses ioredis to connect to Redis Cloud via finance_inbox_REDIS_URL
const Redis = require('ioredis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const redisUrl = process.env.finance_inbox_REDIS_URL;
  if (!redisUrl) {
    return res.status(503).json({ error: 'finance_inbox_REDIS_URL not configured' });
  }

  const KEY = 'expense_inbox';
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2, connectTimeout: 5000, lazyConnect: true });

  try {
    await redis.connect();

    async function getInbox() {
      const raw = await redis.get(KEY);
      return raw ? JSON.parse(raw) : [];
    }

    async function setInbox(list) {
      await redis.set(KEY, JSON.stringify(list));
    }

    // POST — Make.com pushes an OCR-extracted expense here
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

  } catch (e) {
    return res.status(500).json({ error: 'Redis error: ' + e.message });
  } finally {
    redis.disconnect();
  }
};
