// ─── 問卷狀態機（引導式需求收集）───

const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db/database');
const { lineReply, linePush } = require('./line-api');

// Session storage: Map<groupId, session>
const sessions = new Map();

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const STEPS = [
  {
    key: 'STEP_1',
    question: '請問您的公司名稱和所屬產業是什麼？',
    field: 'companyAndIndustry',
  },
  {
    key: 'STEP_2',
    question: '這個工具主要給誰使用？（例如：HR 團隊、業務人員、行銷部門、客服人員等）',
    field: 'targetUsers',
  },
  {
    key: 'STEP_3',
    question: '目前遇到什麼問題，或是希望達成什麼目標？請描述具體的情境或痛點。',
    field: 'painPoint',
  },
  {
    key: 'STEP_4',
    question: '希望這個工具能做到哪些事情？請盡量詳細描述您理想中的功能。',
    field: 'features',
  },
];

function createSession(userId, userName) {
  return {
    stepIndex: 0,
    userId,
    userName,
    answers: {},
    startedAt: Date.now(),
  };
}

function isExpired(session) {
  return Date.now() - session.startedAt > TIMEOUT_MS;
}

function generateSummary(answers) {
  return [
    '--- 需求摘要 ---',
    '',
    `公司/產業：${answers.companyAndIndustry}`,
    `目標用戶：${answers.targetUsers}`,
    `痛點/目標：${answers.painPoint}`,
    `功能期望：${answers.features}`,
    '',
    '---',
    '',
    '如果以上資訊正確，請回覆「確認」',
    '如果需要修改，請回覆「修改」重新填寫',
  ].join('\n');
}

function saveConversation(clientId, groupId, userId, userName, role, message, metadata) {
  run(
    `INSERT INTO conversations (client_id, line_group_id, line_user_id, user_name, role, message, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [clientId, groupId, userId, userName, role, message, metadata ? JSON.stringify(metadata) : null]
  );
}

function findOrCreateClient(groupId, userId, userName, company) {
  const existing = get('SELECT * FROM clients WHERE line_group_id = ?', [groupId]);
  if (existing) return existing;

  const id = uuidv4();
  run(
    'INSERT INTO clients (id, name, company, line_group_id, line_user_id) VALUES (?, ?, ?, ?, ?)',
    [id, userName, company, groupId, userId]
  );
  return get('SELECT * FROM clients WHERE id = ?', [id]);
}

function createTicket(clientId, answers, userName) {
  const id = uuidv4();
  const title = `${userName} - 需求收集`;
  const requirementJson = JSON.stringify(answers);

  run(
    `INSERT INTO tickets (id, client_id, title, status, requirement_json, priority)
     VALUES (?, ?, ?, 'collecting', ?, 'normal')`,
    [id, clientId, title, requirementJson]
  );

  run(
    `INSERT INTO notifications (ticket_id, type, content) VALUES (?, 'new_ticket', ?)`,
    [id, `新工單：${title}`]
  );

  return get('SELECT * FROM tickets WHERE id = ?', [id]);
}

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

/**
 * Handle incoming message in questionnaire context.
 * Returns true if this message was handled (caller should not process further).
 */
async function handleQuestionnaire(groupId, userId, userName, text, replyToken, config) {
  const session = sessions.get(groupId);

  // ── No active session: check for trigger ──
  if (!session) {
    if (!isTrigger(text, config)) return false;

    const newSession = createSession(userId, userName);
    sessions.set(groupId, newSession);

    const botName = config.botName || '專案助理';
    const greeting = [
      `🍑 嗨 ${userName}！我是${botName}。`,
      '',
      '接下來我會用 4 個簡單的問題，幫你整理需求。',
      '大約只需要 2-3 分鐘，完成後我們的專業團隊會盡快為你評估與報價。',
      '',
      '那我們開始囉！',
      '',
      `第 1 題（共 4 題）：${STEPS[0].question}`,
    ].join('\n');

    await lineReply(replyToken, greeting);
    saveConversation(null, groupId, null, '專案助理', 'bot', greeting, { step: 'STEP_1' });
    return true;
  }

  // ── Active session but wrong user → ignore silently ──
  if (session.userId !== userId) return false;

  // ── Session expired ──
  if (isExpired(session)) {
    sessions.delete(groupId);
    await lineReply(replyToken, '問卷已逾時（超過 30 分鐘），如有需要請重新觸發。');
    return true;
  }

  // Save user message
  saveConversation(null, groupId, userId, userName, 'user', text, {
    step: STEPS[session.stepIndex]?.key || 'CONFIRM',
  });

  // ── Confirmation step (after all 4 questions) ──
  if (session.stepIndex >= STEPS.length) {
    const normalized = text.trim();

    if (['確認', '確定', 'yes', 'ok', 'OK'].includes(normalized)) {
      const companyName = session.answers.companyAndIndustry.split(/[，,、\s]/)[0] || userName;
      const client = findOrCreateClient(groupId, userId, userName, companyName);
      const ticket = createTicket(client.id, session.answers, userName);

      // Link orphaned conversations to this client
      run(
        'UPDATE conversations SET client_id = ? WHERE line_group_id = ? AND client_id IS NULL',
        [client.id, groupId]
      );

      const doneMsg = [
        '需求已成功建立！',
        '',
        `工單編號：${ticket.id.slice(0, 8).toUpperCase()}`,
        '',
        '我們的專業團隊會儘快審核您的需求，並提供評估與報價。',
        '後續進度會在這個群組通知您，請稍候。',
      ].join('\n');

      await lineReply(replyToken, doneMsg);
      saveConversation(client.id, groupId, null, '專案助理', 'bot', doneMsg, { step: 'DONE' });

      // Notify admin via LINE push (if configured)
      const adminLineId = config.adminLineUserId;
      if (adminLineId) {
        const notice = [
          '新工單通知',
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

    if (['修改', '重新填寫', '重填'].includes(normalized)) {
      session.stepIndex = 0;
      session.answers = {};

      const restartMsg = `好的，讓我們重新開始。\n\n第 1 題（共 4 題）：${STEPS[0].question}`;
      await lineReply(replyToken, restartMsg);
      saveConversation(null, groupId, null, '專案助理', 'bot', restartMsg, { step: 'STEP_1' });
      return true;
    }

    await lineReply(replyToken, '請回覆「確認」送出需求，或「修改」重新填寫。');
    return true;
  }

  // ── Normal step: save answer and advance ──
  const currentStep = STEPS[session.stepIndex];
  session.answers[currentStep.field] = text.trim();
  session.stepIndex += 1;

  let botReply;

  if (session.stepIndex >= STEPS.length) {
    // All questions answered → show summary
    botReply = generateSummary(session.answers);
  } else {
    const next = STEPS[session.stepIndex];
    const num = session.stepIndex + 1;
    botReply = `第 ${num} 題（共 ${STEPS.length} 題）：${next.question}`;
  }

  await lineReply(replyToken, botReply);
  saveConversation(null, groupId, null, '專案助理', 'bot', botReply, {
    step: STEPS[session.stepIndex]?.key || 'CONFIRM',
  });

  return true;
}

// Periodic cleanup of expired sessions
setInterval(() => {
  for (const [groupId, session] of sessions) {
    if (isExpired(session)) sessions.delete(groupId);
  }
}, 5 * 60 * 1000);

module.exports = { handleQuestionnaire, sessions };
