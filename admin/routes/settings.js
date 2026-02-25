const express = require('express');
const router = express.Router();
const { all, get, run } = require('../../db/database');

// GET /api/settings — get all settings as key-value object
router.get('/', async (req, res) => {
  const rows = await all('SELECT key, value FROM settings');
  const result = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  res.json(result);
});

// PUT /api/settings — upsert a setting
router.put('/', async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: '請提供 key 和 value' });
  }

  const existing = await get('SELECT * FROM settings WHERE key = ?', [key]);
  if (existing) {
    await run('UPDATE settings SET value = ?, updated_at = NOW() WHERE key = ?', [String(value), key]);
  } else {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
  }

  res.json({ key, value: String(value) });
});

module.exports = router;
