const express = require('express');
const router = express.Router();
const { all, get } = require('../../db/database');

// GET /api/conversations — list conversations (with optional filters)
router.get('/', async (req, res) => {
  const { client_id, group_id, limit: limitParam } = req.query;
  let sql = 'SELECT * FROM conversations';
  const params = [];
  const conditions = [];

  if (client_id) {
    conditions.push('client_id = ?');
    params.push(client_id);
  }
  if (group_id) {
    conditions.push('line_group_id = ?');
    params.push(group_id);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';

  const limit = Math.min(parseInt(limitParam) || 200, 500);
  sql += ` LIMIT ${limit}`;

  res.json(await all(sql, params));
});

// GET /api/conversations/groups — list distinct groups with latest message
router.get('/groups', async (req, res) => {
  const groups = await all(`
    SELECT
      c.line_group_id,
      c.client_id,
      cl.name AS client_name,
      cl.company AS client_company,
      MAX(c.created_at) AS last_message_at,
      COUNT(*)::int AS message_count
    FROM conversations c
    LEFT JOIN clients cl ON c.client_id = cl.id
    WHERE c.line_group_id IS NOT NULL
    GROUP BY c.line_group_id, c.client_id, cl.name, cl.company
    ORDER BY last_message_at DESC
  `);
  res.json(groups);
});

module.exports = router;
