const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../../db/database');

router.get('/', async (req, res) => {
  const { status, client_id } = req.query;
  let sql = `SELECT t.*, c.name as client_name, c.company as client_company
             FROM tickets t LEFT JOIN clients c ON t.client_id = c.id`;
  const conditions = [];
  const params = [];

  if (status) { conditions.push('t.status = ?'); params.push(status); }
  if (client_id) { conditions.push('t.client_id = ?'); params.push(client_id); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY t.created_at DESC';

  res.json(await all(sql, params));
});

router.get('/:id', async (req, res) => {
  const ticket = await get(
    `SELECT t.*, c.name as client_name, c.company as client_company
     FROM tickets t LEFT JOIN clients c ON t.client_id = c.id WHERE t.id = ?`,
    [req.params.id]
  );
  if (!ticket) return res.status(404).json({ error: '找不到工單' });
  res.json(ticket);
});

router.post('/', async (req, res) => {
  const { client_id, title, requirement_json, priority, price, admin_notes, skill_id } = req.body;
  if (!client_id || !title) return res.status(400).json({ error: '請提供客戶 ID 和工單標題' });

  const client = await get('SELECT id FROM clients WHERE id = ?', [client_id]);
  if (!client) return res.status(400).json({ error: '找不到指定的客戶' });

  const id = uuidv4();
  await run(
    `INSERT INTO tickets (id, client_id, title, requirement_json, priority, price, admin_notes, skill_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, client_id, title, requirement_json || null, priority || 'normal', price || null, admin_notes || null, skill_id || null]
  );

  await run(
    `INSERT INTO notifications (ticket_id, type, content) VALUES (?, 'new_ticket', ?)`,
    [id, `新工單：${title}`]
  );

  res.status(201).json(await get('SELECT * FROM tickets WHERE id = ?', [id]));
});

router.put('/:id', async (req, res) => {
  const existing = await get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '找不到工單' });

  const { title, client_id, requirement_json, priority, price, price_note, admin_notes, skill_id, delivery_url } = req.body;
  await run(
    `UPDATE tickets SET title = ?, client_id = ?, requirement_json = ?, priority = ?,
     price = ?, price_note = ?, admin_notes = ?, skill_id = ?, delivery_url = ?,
     updated_at = NOW() WHERE id = ?`,
    [title ?? existing.title, client_id ?? existing.client_id,
     requirement_json ?? existing.requirement_json, priority ?? existing.priority,
     price ?? existing.price, price_note ?? existing.price_note,
     admin_notes ?? existing.admin_notes, skill_id ?? existing.skill_id,
     delivery_url ?? existing.delivery_url, req.params.id]
  );

  res.json(await get('SELECT * FROM tickets WHERE id = ?', [req.params.id]));
});

router.put('/:id/status', async (req, res) => {
  const existing = await get('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '找不到工單' });

  const { status } = req.body;
  const validStatuses = ['collecting', 'quoted', 'pending_payment', 'developing', 'testing', 'delivered', 'closed'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: '無效的狀態' });

  const timestampField = { quoted: 'quoted_at', developing: 'paid_at', delivered: 'delivered_at', closed: 'closed_at' }[status];

  let sql = 'UPDATE tickets SET status = ?, updated_at = NOW()';
  const params = [status];
  if (timestampField) sql += `, ${timestampField} = NOW()`;
  sql += ' WHERE id = ?';
  params.push(req.params.id);
  await run(sql, params);

  const statusLabels = {
    collecting: '需求收集中', quoted: '已報價', pending_payment: '待付款',
    developing: '開發中', testing: '測試中', delivered: '已交付', closed: '已結案'
  };
  await run(
    `INSERT INTO notifications (ticket_id, type, content) VALUES (?, 'status_change', ?)`,
    [req.params.id, `工單狀態變更為：${statusLabels[status]}`]
  );

  res.json(await get('SELECT * FROM tickets WHERE id = ?', [req.params.id]));
});

module.exports = router;
