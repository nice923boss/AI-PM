// ─── AI 驅動的對話式需求收集 ───
// 取代原本的固定 4 題狀態機，改用 AI 判斷回答品質並自然引導對話

const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db/database');
const { lineReply, linePush } = require('./line-api');
const { callOpenRouter } = require('./openrouter');
const { REQUIREMENT_COLLECTION_PROMPT } = require('./system-prompt');

// ── Session 管理 ──

const sessions = new Map();

const TIMEOUT_MS = 30 * 60 * 1000; // 30 分鐘
const MAX_TURNS = 25; // 安全上限，避免無限對話
const SUMMARY_TAG = '[SUMMARY]';

function createSession(userId, userName) {
  return {
    userId,
    userName,
    history: [],         // { role: 'user' | 'assistant', content: string }
    phase: 'collecting', // 'collecting' | 'confirming'
    summaryText: null,   // 確認階段時暫存的需求摘要
    turnCount: 0,
    startedAt: Date.now(),
  };
}

function isExpired(session) {
  return Date.now() - session.startedAt > TIMEOUT_MS;
}

// ── Skills 快取（避免每次對話都查 DB） ──

let skillsCache = null;
let skillsCacheTime = 0;
const SKILLS_CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

async function getActiveSkills() {
  if (skillsCache && Date.now() - skillsCacheTime < SKILLS_CACHE_TTL) {
    return skillsCache;
  }
  const rows = await all('SELECT display_name, category, description FROM skills WHERE is_active = true ORDER BY category, display_name');
  skillsCache = rows;
  skillsCacheTime = Date.now();
  return rows;
}

function formatSkillsForPrompt(skills) {
  if (!skills || skills.length === 0) {
    return '（目前尚未建立服務方案，所有需求都以客製開發方式處理）';
  }
  return skills.map(s => {
    const desc = s.description ? ` — ${s.description}` : '';
    return `・【${s.display_name}】（${s.category}）${desc}`;
  }).join('\n');
}

// ── 資料庫操作 ──

async function saveConversation(clientId, groupId, userId, userName, role, message, metadata) {
  await run(
    `INSERT INTO conversations (client_id, line_group_id, line_user_id, user_name, role, message, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [clientId, groupId, userId, userName, role, message, metadata ? JSON.stringify(metadata) : null]
  );
}

async function findOrCreateClient(groupId, userId, userName, company) {
  const existing = await get('SELECT * FROM clients WHERE line_group_id = ?', [groupId]);
  if (existing) return existing;

  const id = uuidv4();
  await run(
    'INSERT INTO clients (id, name, company, line_group_id, line_user_id) VALUES (?, ?, ?, ?, ?)',
    [id, userName, company, groupId, userId]
  );
  return await get('SELECT * FROM clients WHERE id = ?', [id]);
}

async function createTicket(clientId, summaryText, userName, matchedSkillId) {
  const id = uuidv4();
  const title = `${userName} - 需求收集`;

  await run(
    `INSERT INTO tickets (id, client_id, title, status, requirement_json, priority, skill_id)
     VALUES (?, ?, ?, 'collecting', ?, 'normal', ?)`,
    [id, clientId, title, JSON.stringify({ summary: summaryText }), matchedSkillId || null]
  );

  await run(
    `INSERT INTO notifications (ticket_id, type, content) VALUES (?, 'new_ticket', ?)`,
    [id, `新工單：${title}`]
  );

  return await get('SELECT * FROM tickets WHERE id = ?', [id]);
}

// ── 觸發關鍵字判斷 ──

function isTrigger(text, config) {
  const normalized = text.trim();
  const triggers = config.triggerKeywords || [];
  const prefixes = config.commandPrefixes || [];

  for (const kw of triggers) {
    if (normalized.includes(kw)) return true;
  }
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) return true;
  }
  return false;
}

// ── 從摘要中提取公司名稱 ──

function extractCompanyFromSummary(summaryText) {
  const match = summaryText.match(/公司[/／]?產業[：:]\s*(.+)/);
  if (match) {
    const raw = match[1].trim();
    // 取第一個斜線或逗號前的部分作為公司名
    return raw.split(/[/／，,、（(]/)[0].trim();
  }
  return null;
}

// ── 從摘要關鍵字匹配最相關的 Skill（內部參考，不顯示給客戶） ──

async function matchSkillFromSummary(summaryText) {
  const skills = await getActiveSkills();
  if (!skills || skills.length === 0) return null;

  // 簡單關鍵字比對：看摘要中是否包含某個 Skill 的 display_name 或 description 關鍵字
  for (const s of skills) {
    if (summaryText.includes(s.display_name)) {
      const full = await get('SELECT id FROM skills WHERE display_name = ? AND is_active = true', [s.display_name]);
      return full ? full.id : null;
    }
  }
  return null;
}

// ── AI 對話核心 ──

async function getAIResponse(session, config) {
  const botName = config.botName || '白澤小桃';

  // 讀取 Skills 並注入 System Prompt
  const skills = await getActiveSkills();
  const skillsText = formatSkillsForPrompt(skills);
  const prompt = REQUIREMENT_COLLECTION_PROMPT.replace('{SKILLS_PLACEHOLDER}', skillsText);

  // 建立 AI 訊息陣列
  const messages = [
    { role: 'system', content: prompt },
    ...session.history,
  ];

  // 如果對話太長，提醒 AI 該收尾了
  if (session.turnCount >= MAX_TURNS - 3) {
    messages.push({
      role: 'system',
      content: '對話已經持續很久了，請根據目前收集到的資訊，盡快整理需求摘要給客戶確認。如果某些資訊不完整，在摘要的備註中註明即可。',
    });
  }

  const response = await callOpenRouter(messages, {
    maxTokens: 600,
    temperature: 0.7,
  });

  return response;
}

// ── 判斷是否為管理者 ──

function isAdmin(userId, config) {
  const adminId = config.adminLineUserId;
  return adminId && userId === adminId;
}

// ── 判斷是否為群組（非 1 對 1） ──

function isGroupChat(groupId, userId) {
  // 在 1 對 1 聊天中，groupId 會被設為 userId（因為沒有 groupId）
  return groupId !== userId;
}

// ── 主要入口 ──

async function handleQuestionnaire(groupId, userId, userName, text, replyToken, config) {
  const session = sessions.get(groupId);
  const botName = config.botName || '白澤小桃';
  const inGroup = isGroupChat(groupId, userId);
  const userIsAdmin = isAdmin(userId, config);

  // ── 管理者在群組中 → 處理管理指令，其餘忽略 ──
  if (userIsAdmin && inGroup) {
    const cmd = text.trim().toLowerCase();

    // /reset — 清除該群組的對話 session
    if (cmd === '/reset' || cmd === '/重置') {
      if (sessions.has(groupId)) {
        sessions.delete(groupId);
        await lineReply(replyToken, '🔄 已重置對話，客戶可以重新開始囉！');
      } else {
        await lineReply(replyToken, '目前沒有進行中的對話 🍑');
      }
      return true;
    }

    // /status — 查看該群組目前的對話狀態
    if (cmd === '/status' || cmd === '/狀態') {
      if (sessions.has(groupId)) {
        const s = sessions.get(groupId);
        const mins = Math.round((Date.now() - s.startedAt) / 60000);
        await lineReply(replyToken, [
          `📊 對話狀態`,
          `客戶：${s.userName}`,
          `階段：${s.phase === 'collecting' ? '收集中' : '確認中'}`,
          `對話輪次：${s.turnCount}`,
          `已進行：${mins} 分鐘`,
        ].join('\n'));
      } else {
        await lineReply(replyToken, '目前沒有進行中的對話 🍑');
      }
      return true;
    }

    // 其他管理者訊息 → 忽略
    return false;
  }

  // ── 沒有進行中的 session：檢查觸發 ──
  if (!session) {
    if (!isTrigger(text, config)) return false;

    const newSession = createSession(userId, userName);
    sessions.set(groupId, newSession);

    const greeting = [
      `🍑 嗨 ${userName}！我是${botName}。`,
      '',
      '我是你的專案助理，專門幫你規劃「什麼樣的工具」最能解決你的問題，然後由我們的團隊量身打造給你 🍑',
      '',
      '先聊聊吧——你想打造什麼樣的工具呢？或是可以先說說目前遇到什麼困擾，我來想想能用什麼工具幫你！',
    ].join('\n');

    newSession.history.push({ role: 'assistant', content: greeting });

    await lineReply(replyToken, greeting);
    await saveConversation(null, groupId, null, botName, 'bot', greeting, { phase: 'greeting' });
    return true;
  }

  // ── 不是 session 發起者 → 忽略 ──
  if (session.userId !== userId) return false;

  // ── 逾時 ──
  if (isExpired(session)) {
    sessions.delete(groupId);
    await lineReply(replyToken, '對話已逾時（超過 30 分鐘），如有需要請重新輸入觸發關鍵字 🍑');
    return true;
  }

  // 記錄使用者訊息
  session.history.push({ role: 'user', content: text });
  session.turnCount += 1;
  await saveConversation(null, groupId, userId, userName, 'user', text, { phase: session.phase });

  // ── 確認階段 ──
  if (session.phase === 'confirming') {
    return handleConfirming(session, groupId, userId, userName, text, replyToken, config);
  }

  // ── 收集階段：交給 AI ──
  return handleCollecting(session, groupId, userId, userName, text, replyToken, config);
}

// ── 收集階段：AI 引導對話 ──

async function handleCollecting(session, groupId, userId, userName, text, replyToken, config) {
  const botName = config.botName || '白澤小桃';

  const aiResponse = await getAIResponse(session, config);

  // AI 呼叫失敗
  if (!aiResponse) {
    const fallback = '不好意思，我剛才恍神了一下 😅 可以再說一次嗎？';
    session.history.push({ role: 'assistant', content: fallback });
    await lineReply(replyToken, fallback);
    await saveConversation(null, groupId, null, botName, 'bot', fallback, { phase: 'collecting', error: true });
    return true;
  }

  // 檢查 AI 是否決定輸出需求摘要
  if (aiResponse.includes(SUMMARY_TAG)) {
    const cleanResponse = aiResponse.replace(SUMMARY_TAG, '').trim();
    session.phase = 'confirming';
    session.summaryText = cleanResponse;
    session.history.push({ role: 'assistant', content: cleanResponse });

    await lineReply(replyToken, cleanResponse);
    await saveConversation(null, groupId, null, botName, 'bot', cleanResponse, { phase: 'confirming' });
    return true;
  }

  // 一般對話回覆
  session.history.push({ role: 'assistant', content: aiResponse });
  await lineReply(replyToken, aiResponse);
  await saveConversation(null, groupId, null, botName, 'bot', aiResponse, { phase: 'collecting' });
  return true;
}

// ── 確認階段 ──

async function handleConfirming(session, groupId, userId, userName, text, replyToken, config) {
  const botName = config.botName || '白澤小桃';
  const normalized = text.trim();

  // 使用者確認 → 建立工單
  const confirmWords = ['確認', '確定', 'yes', 'ok', 'OK', '沒問題', '可以', '對', '好'];
  if (confirmWords.includes(normalized)) {
    const companyName = extractCompanyFromSummary(session.summaryText || '') || userName;
    const matchedSkillId = await matchSkillFromSummary(session.summaryText || '');
    const client = await findOrCreateClient(groupId, userId, userName, companyName);
    const ticket = await createTicket(client.id, session.summaryText || '', userName, matchedSkillId);

    // 把之前沒有 client_id 的對話記錄補上
    await run(
      'UPDATE conversations SET client_id = ? WHERE line_group_id = ? AND client_id IS NULL',
      [client.id, groupId]
    );

    const doneMsg = [
      '🍑 太好了！需求已成功建立！',
      '',
      `工單編號：${ticket.id.slice(0, 8).toUpperCase()}`,
      '',
      '我們的專業團隊會儘快審核你的需求，並提供評估與報價。',
      '後續進度會在這裡通知你，請稍候～',
    ].join('\n');

    await lineReply(replyToken, doneMsg);
    await saveConversation(client.id, groupId, null, botName, 'bot', doneMsg, { phase: 'done' });

    // 通知管理員
    const adminLineId = config.adminLineUserId;
    if (adminLineId) {
      const notice = [
        '📢 新工單通知',
        '',
        `客戶：${userName}`,
        `公司：${companyName}`,
        `工單：${ticket.id.slice(0, 8).toUpperCase()}`,
        '',
        '請至後台查看詳情。',
      ].join('\n');
      await linePush(adminLineId, notice);
    }

    sessions.delete(groupId);
    return true;
  }

  // 使用者想修改 → 回到收集階段，讓 AI 根據回饋繼續對話
  session.phase = 'collecting';
  return handleCollecting(session, groupId, userId, userName, text, replyToken, config);
}

// ── 定期清理過期 session ──

setInterval(() => {
  for (const [groupId, session] of sessions) {
    if (isExpired(session)) sessions.delete(groupId);
  }
}, 5 * 60 * 1000);

module.exports = { handleQuestionnaire, sessions };
