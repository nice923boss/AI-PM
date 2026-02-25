const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../../db/database');

router.get('/', async (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT * FROM skills';
  const params = [];
  if (category) { sql += ' WHERE category = ?'; params.push(category); }
  sql += ' ORDER BY created_at DESC';
  res.json(await all(sql, params));
});

router.get('/:id', async (req, res) => {
  const skill = await get('SELECT * FROM skills WHERE id = ?', [req.params.id]);
  if (!skill) return res.status(404).json({ error: '找不到 Skill' });
  res.json(skill);
});

router.post('/', async (req, res) => {
  const { name, display_name, category, description, demo_url, pricing_tier, base_price, features_json } = req.body;
  if (!name || !display_name || !category) return res.status(400).json({ error: '請提供 name, display_name, category' });

  const id = uuidv4();
  await run(
    `INSERT INTO skills (id, name, display_name, category, description, demo_url, pricing_tier, base_price, features_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, display_name, category, description || null, demo_url || null, pricing_tier || 'standard', base_price || null, features_json || null]
  );

  res.status(201).json(await get('SELECT * FROM skills WHERE id = ?', [id]));
});

router.put('/:id', async (req, res) => {
  const existing = await get('SELECT * FROM skills WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '找不到 Skill' });

  const { name, display_name, category, description, demo_url, pricing_tier, base_price, features_json, is_active } = req.body;
  await run(
    `UPDATE skills SET name = ?, display_name = ?, category = ?, description = ?,
     demo_url = ?, pricing_tier = ?, base_price = ?, features_json = ?, is_active = ? WHERE id = ?`,
    [name ?? existing.name, display_name ?? existing.display_name, category ?? existing.category,
     description ?? existing.description, demo_url ?? existing.demo_url,
     pricing_tier ?? existing.pricing_tier, base_price ?? existing.base_price,
     features_json ?? existing.features_json, is_active ?? existing.is_active, req.params.id]
  );

  res.json(await get('SELECT * FROM skills WHERE id = ?', [req.params.id]));
});

module.exports = router;
