require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { initDatabase, all, run } = require('./db/database');
const { authMiddleware, loginHandler } = require('./admin/middleware/auth');
const { verifySignature, getDisplayName, lineReply, fetchBotProfile } = require('./bot/line-api');
const { handleQuestionnaire } = require('./bot/questionnaire');

const app = express();
const PORT = process.env.PORT || 3000;

// Load bot config
const botConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'bot', 'bot-config.json'), 'utf8'));

// --- LINE Webhook (must be BEFORE express.json() — needs raw body for HMAC) ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!signature) return res.status(400).send('Missing signature');

  if (!verifySignature(req.body, signature)) {
    console.warn('LINE signature verification failed');
    return res.status(403).send('Invalid signature');
  }

  // Respond 200 immediately (avoid LINE retry)
  res.status(200).send('OK');

  // Process events in background
  try {
    const body = JSON.parse(req.body.toString());
    for (const event of body.events) {
      handleLineEvent(event).catch(err => console.error('Event handling error:', err));
    }
  } catch (err) {
    console.error('Webhook parse error:', err);
  }
});

// --- LINE Event Handler ---
async function handleLineEvent(event) {
  // Only handle text messages in groups or 1-on-1 chats
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const { replyToken } = event;
  const text = event.message.text;
  const userId = event.source.userId;
  const groupId = event.source.groupId || event.source.roomId || userId;

  // /myid command — reply with user's LINE userId (for admin debugging)
  if (text.trim() === '/myid') {
    const info = [
      `👤 你的 LINE 資訊`,
      `userId: ${userId}`,
      groupId !== userId ? `groupId: ${groupId}` : '（1 對 1 聊天）',
    ].join('\n');
    await lineReply(replyToken, info);
    return;
  }

  const userName = await getDisplayName(userId, event.source.groupId);

  // Try questionnaire handler first
  const handled = await handleQuestionnaire(groupId, userId, userName, text, replyToken, botConfig);
  if (handled) return;

  // Not a questionnaire trigger — ignore (bot only responds to triggers)
}

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Static Files (Admin Frontend) ---
app.use('/admin', express.static(path.join(__dirname, 'admin', 'public')));

// --- Auth Routes ---
app.post('/api/auth/login', loginHandler);

// --- Protected API Routes ---
const dashboardRoutes = require('./admin/routes/dashboard');
const clientsRoutes = require('./admin/routes/clients');
const ticketsRoutes = require('./admin/routes/tickets');
const skillsRoutes = require('./admin/routes/skills');
const conversationsRoutes = require('./admin/routes/conversations');
const settingsRoutes = require('./admin/routes/settings');

app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/clients', authMiddleware, clientsRoutes);
app.use('/api/tickets', authMiddleware, ticketsRoutes);
app.use('/api/skills', authMiddleware, skillsRoutes);
app.use('/api/conversations', authMiddleware, conversationsRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);

// --- Notifications API ---
app.get('/api/notifications', authMiddleware, (req, res) => {
  const unread = req.query.unread === 'true';
  let sql = 'SELECT * FROM notifications';
  if (unread) sql += ' WHERE is_read = 0';
  sql += ' ORDER BY created_at DESC LIMIT 50';
  res.json(all(sql));
});

app.put('/api/notifications/:id/read', authMiddleware, (req, res) => {
  run('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// --- Health Check ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'AI-PM',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// --- Root redirect to Admin ---
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// --- Admin SPA Fallback ---
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'public', 'index.html'));
});

// --- Keep-Alive (for Render free tier) ---
function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
  if (!url) return;

  const healthUrl = url.replace(/\/$/, '') + '/health';
  setInterval(async () => {
    try {
      await fetch(healthUrl);
    } catch (_) {
      // Ignore keep-alive errors
    }
  }, 14 * 60 * 1000);
}

// --- Start Server (async for sql.js init) ---
async function start() {
  await initDatabase();
  console.log('Database initialized');

  // Fetch LINE bot profile (non-blocking, informational only)
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    fetchBotProfile().catch(() => {});
  }

  app.listen(PORT, () => {
    console.log(`AI-PM server running on port ${PORT}`);
    console.log(`Admin:   http://localhost:${PORT}/admin`);
    console.log(`API:     http://localhost:${PORT}/api`);
    console.log(`Webhook: http://localhost:${PORT}/webhook`);
    startKeepAlive();
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
