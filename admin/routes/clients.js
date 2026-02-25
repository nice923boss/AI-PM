const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../../db/database');

router.get('/', (req, res) => {
  res.json(all('SELECT * FROM clients ORDER BY created_at DESC'));
});

router.get('/:id', (req, res) => {
  const client = get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!client) return res.status(404).json({ error: '找不到客戶' });
  res.json(client);
});

router.post('/', (req, res) => {
  const { name, company, contact_email, contact_phone, notes, line_group_id, line_user_id } = req.body;
  if (!name) return res.status(400).json({ error: '請提供客戶姓名' });

  const id = uuidv4();
  run(
    `INSERT INTO clients (id, name, company, contact_email, contact_phone, notes, line_group_id, line_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, company || null, contact_email || null, contact_phone || null, notes || null, line_group_id || null, line_user_id || null]
  );

  res.status(201).json(get('SELECT * FROM clients WHERE id = ?', [id]));
});

router.put('/:id', (req, res) => {
  const existing = get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '找不到客戶' });

  const { name, company, contact_email, contact_phone, notes } = req.body;
  run(
    `UPDATE clients SET name = ?, company = ?, contact_email = ?, contact_phone = ?, notes = ?,
     updated_at = datetime('now') WHERE id = ?`,
    [name ?? existing.name, company ?? existing.company, contact_email ?? existing.contact_email,
     contact_phone ?? existing.contact_phone, notes ?? existing.notes, req.params.id]
  );

  res.json(get('SELECT * FROM clients WHERE id = ?', [req.params.id]));
});

router.delete('/:id', (req, res) => {
  const existing = get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '找不到客戶' });

  run('DELETE FROM clients WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
