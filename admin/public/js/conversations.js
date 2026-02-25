// ─── 對話紀錄頁面邏輯 ───

let conversationGroups = [];
let currentGroupId = null;

async function load_conversations() {
  try {
    conversationGroups = await api('/conversations/groups');
    renderGroupList();

    if (conversationGroups.length > 0 && !currentGroupId) {
      selectGroup(conversationGroups[0].line_group_id);
    } else if (currentGroupId) {
      selectGroup(currentGroupId);
    } else {
      renderEmptyChat();
    }
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

function renderGroupList() {
  const container = document.getElementById('conversation-groups');
  if (!container) return;

  if (conversationGroups.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:24px"><p>尚無對話紀錄</p></div>';
    return;
  }

  container.innerHTML = conversationGroups.map(g => {
    const name = g.client_name || g.line_group_id?.slice(0, 8) || '未知';
    const company = g.client_company ? ` (${escapeHtml(g.client_company)})` : '';
    const active = g.line_group_id === currentGroupId ? 'active' : '';
    return `
      <div class="conversation-group-item ${active}" onclick="selectGroup('${g.line_group_id}')">
        <div class="group-name">${escapeHtml(name)}${company}</div>
        <div class="group-meta">${g.message_count} 則訊息 &middot; ${formatDate(g.last_message_at)}</div>
      </div>
    `;
  }).join('');
}

async function selectGroup(groupId) {
  currentGroupId = groupId;
  renderGroupList();

  const chatContainer = document.getElementById('conversation-chat');
  if (!chatContainer) return;

  chatContainer.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8">載入中...</div>';

  try {
    const messages = await api(`/conversations?group_id=${encodeURIComponent(groupId)}&limit=200`);
    // Reverse to show chronological order (API returns DESC)
    const sorted = [...messages].reverse();
    renderChat(sorted);
  } catch (err) {
    chatContainer.innerHTML = '<div class="empty-state"><p>載入失敗</p></div>';
  }
}

function renderChat(messages) {
  const chatContainer = document.getElementById('conversation-chat');
  if (!chatContainer) return;

  if (messages.length === 0) {
    chatContainer.innerHTML = '<div class="empty-state" style="padding:24px"><p>此群組尚無訊息</p></div>';
    return;
  }

  chatContainer.innerHTML = messages.map(m => {
    const isBot = m.role === 'bot';
    const name = m.user_name || (isBot ? '專案助理' : '用戶');
    const time = formatDate(m.created_at);
    return `
      <div class="chat-message ${isBot ? 'bot' : 'user'}">
        <div class="chat-name">${escapeHtml(name)} <span class="chat-time">${time}</span></div>
        <div class="chat-bubble">${escapeHtml(m.message)}</div>
      </div>
    `;
  }).join('');

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function renderEmptyChat() {
  const chatContainer = document.getElementById('conversation-chat');
  if (!chatContainer) return;
  chatContainer.innerHTML = `
    <div class="empty-state" style="padding:48px;text-align:center">
      <div class="empty-icon">&#9993;</div>
      <p>選擇左側群組查看對話紀錄</p>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
