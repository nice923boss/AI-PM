const express = require('express');
const router = express.Router();
const { all, get } = require('../../db/database');

router.get('/', (req, res) => {
  const activeClients = get('SELECT COUNT(*) as count FROM clients').count;

  const activeTickets = get(
    `SELECT COUNT(*) as count FROM tickets WHERE status NOT IN ('delivered', 'closed')`
  ).count;

  const urgentCount = get(
    `SELECT COUNT(*) as count FROM tickets WHERE priority = 'urgent' AND status NOT IN ('delivered', 'closed')`
  ).count;

  const recentConversations = get(
    `SELECT COUNT(*) as count FROM conversations WHERE created_at >= datetime('now', '-1 day')`
  ).count;

  const recentTickets = all(
    `SELECT t.id, t.title, t.status, t.priority, t.created_at,
            c.name as client_name, c.company as client_company
     FROM tickets t LEFT JOIN clients c ON t.client_id = c.id
     ORDER BY t.created_at DESC LIMIT 10`
  );

  const unreadNotifications = all(
    `SELECT id, ticket_id, type, content, created_at
     FROM notifications WHERE is_read = 0
     ORDER BY created_at DESC LIMIT 20`
  );

  res.json({
    stats: { activeClients, activeTickets, recentConversations, urgentCount },
    recentTickets,
    unreadNotifications
  });
});

module.exports = router;
