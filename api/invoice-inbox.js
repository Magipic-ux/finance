// Vercel serverless — invoice inbox backed by Redis
// Make.com scenario pushes invoices here; dashboard reads/patches via GET/PATCH
const Redis = require('ioredis');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const redisUrl = process.env.finance_inbox_REDIS_URL;
  if (!redisUrl) return res.status(503).json({ error: 'finance_inbox_REDIS_URL not configured' });

  const KEY = 'invoice_inbox';
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

    // POST — Make.com pushes a parsed invoice here
    if (req.method === 'POST') {
      const inv = req.body || {};
      const inbox = await getInbox();
      // Deduplicate by invoice_number + vendor
      const key = `${inv.invoice_number || inv.vendor || ''}-${inv.amount || ''}`;
      const isDupe = inbox.some(r => r._key === key);
      if (!isDupe) {
        inbox.push({
          key:            `redis-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          _key:           key,
          vendor:         inv.vendor         || 'Unknown',
          amount:         parseFloat(inv.amount || 0),
          currency:       inv.currency        || 'USD',
          invoice_date:   inv.invoice_date    || inv.date || new Date().toISOString(),
          due_date:       inv.due_date        || '',
          invoice_number: inv.invoice_number  || '',
          category:       inv.category        || 'Professional Services',
          description:    inv.description     || inv.notes || '',
          sender_email:   inv.sender_email    || '',
          status:         inv.status          || 'pending',
          source:         inv.source          || 'email',
          _receivedAt:    new Date().toISOString()
        });
        await setInbox(inbox);
      }
      return res.status(200).json({ ok: true, pending: inbox.length, duplicate: isDupe });
    }

    // GET — dashboard polls for invoices
    if (req.method === 'GET') {
      const inbox = await getInbox();
      return res.status(200).json({ records: inbox, count: inbox.length });
    }

    // PATCH — mark invoice as paid
    if (req.method === 'PATCH') {
      const { recordKey, status } = req.body || {};
      if (!recordKey) return res.status(400).json({ error: 'Missing recordKey' });
      const inbox = await getInbox();
      const idx = inbox.findIndex(r => r.key === recordKey);
      if (idx === -1) return res.status(404).json({ error: 'Record not found' });
      inbox[idx].status = status || 'paid';
      inbox[idx]._paidAt = new Date().toISOString();
      await setInbox(inbox);
      return res.status(200).json({ ok: true });
    }

    // DELETE — clear inbox
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
