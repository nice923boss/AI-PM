const express = require('express');
const router = express.Router();
const { all, get } = require('../../db/database');

router.get('/', async (req, res) => {
  try {
    const activeClients = (await get('SELECT COUNT(*)::int as count FROM clients')).count;

    const activeTickets = (await get(
      `SELECT COUNT(*)::int as count FROM tickets WHERE status NOT IN ('delivered', 'closed')`
    )).count;

    const urgentCount = (await get(
      `SELECT COUNT(*)::int as count FROM tickets WHERE priority = 'urgent' AND status NOT IN ('delivered', 'closed')`
    )).count;

    const recentConversations = (await get(
      `SELECT COUNT(*)::int as count FROM conversations WHERE created_at >= NOW() - INTERVAL '1 day'`
    )).count;

    const recentTickets = await all(
      `SELECT t.id, t.title, t.status, t.priority, t.created_at,
              c.name as client_name, c.company as client_company
       FROM tickets t LEFT JOIN clients c ON t.client_id = c.id
       ORDER BY t.created_at DESC LIMIT 10`
    );

    const unreadNotifications = await all(
      `SELECT id, ticket_id, type, content, created_at
       FROM notifications WHERE is_read = false
       ORDER BY created_at DESC LIMIT 20`
    );

    res.json({
      stats: { activeClients, activeTickets, recentConversations, urgentCount },
      recentTickets,
      unreadNotifications
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
