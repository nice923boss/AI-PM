const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'default-secret';

function generateToken() {
  const payload = Date.now().toString();
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET);
  hmac.update(payload);
  return `${payload}.${hmac.digest('hex')}`;
}

function verifyToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET);
  hmac.update(payload);
  const expected = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授權，請先登入' });
  }

  const token = authHeader.slice(7);
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Token 無效或已過期' });
  }

  next();
}

function loginHandler(req, res) {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: '密碼錯誤' });
  }

  const token = generateToken();
  res.json({ token });
}

module.exports = { authMiddleware, loginHandler };
