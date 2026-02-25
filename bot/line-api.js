const crypto = require('crypto');

// ─── LINE API 工具函數（移植自 line-ai-assistant） ───

const LINE_TOKEN = () => process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_SECRET = () => process.env.LINE_CHANNEL_SECRET;

async function lineFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_TOKEN()}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`LINE API error [${res.status}]: ${text}`);
    return null;
  }
  return res.json();
}

async function fetchBotProfile() {
  const data = await lineFetch('https://api.line.me/v2/bot/info');
  if (data) {
    console.log(`Bot info: ${data.displayName} (${data.userId})`);
  }
  return data;
}

const displayNameCache = new Map();

async function getDisplayName(userId, groupId) {
  if (displayNameCache.has(userId)) return displayNameCache.get(userId);

  let data = null;
  if (groupId) {
    data = await lineFetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`);
  } else {
    data = await lineFetch(`https://api.line.me/v2/bot/profile/${userId}`);
  }

  const name = data?.displayName || '未知用戶';
  displayNameCache.set(userId, name);
  return name;
}

async function lineReply(replyToken, text) {
  const truncated = text.length > 5000 ? text.slice(0, 4990) + '...(略)' : text;
  return lineFetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: truncated }],
    }),
  });
}

async function linePush(targetId, text) {
  const truncated = text.length > 5000 ? text.slice(0, 4990) + '...(略)' : text;
  return lineFetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    body: JSON.stringify({
      to: targetId,
      messages: [{ type: 'text', text: truncated }],
    }),
  });
}

function verifySignature(body, signature) {
  const hash = crypto
    .createHmac('SHA256', LINE_SECRET())
    .update(body)
    .digest('base64');
  return hash === signature;
}

module.exports = {
  fetchBotProfile,
  getDisplayName,
  lineReply,
  linePush,
  verifySignature,
  displayNameCache,
};
