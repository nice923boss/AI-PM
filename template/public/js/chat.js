// ─── Chat Core Logic ───

const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const charCount = document.getElementById('char-count');
const chatWelcome = document.getElementById('chat-welcome');

let conversationHistory = [];
let isLoading = false;

// ─── Init: Load brand config ───
(async () => {
  try {
    const res = await fetch('/api/config');
    const { brand } = await res.json();
    if (brand.toolName) {
      document.title = brand.toolName;
      const titleEl = document.getElementById('header-title');
      if (titleEl) titleEl.textContent = brand.toolName;
      const welcomeTitle = document.getElementById('welcome-title');
      if (welcomeTitle) welcomeTitle.textContent = `歡迎使用${brand.toolName}`;
    }
    // Apply brand colors via CSS variables
    if (brand.primaryColor) {
      document.documentElement.style.setProperty('--primary', brand.primaryColor);
    }
    if (brand.accentColor) {
      document.documentElement.style.setProperty('--accent', brand.accentColor);
    }
  } catch (_) {
    // Config load failed — use defaults
  }
})();

// ─── Input handlers ───
userInput.addEventListener('input', () => {
  charCount.textContent = userInput.value.length;
  sendBtn.disabled = !userInput.value.trim() || isLoading;

  // Auto-resize textarea
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

// ─── Send message ───
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;

  // Hide welcome
  if (chatWelcome) chatWelcome.style.display = 'none';

  // Add user message
  appendMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  // Clear input
  userInput.value = '';
  userInput.style.height = 'auto';
  charCount.textContent = '0';
  sendBtn.disabled = true;
  isLoading = true;

  // Show typing indicator
  const typingEl = showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    removeTyping(typingEl);

    if (!res.ok) {
      appendMessage('assistant', '抱歉，目前系統忙碌中，請稍後再試。');
      return;
    }

    const data = await res.json();
    const reply = data.content || '抱歉，我無法回答這個問題。';
    appendMessage('assistant', reply);
    conversationHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    removeTyping(typingEl);
    appendMessage('assistant', '連線異常，請檢查網路後重試。');
  } finally {
    isLoading = false;
    sendBtn.disabled = !userInput.value.trim();
  }
}

// ─── DOM helpers ───
function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<div class="message-bubble">${escapeHtml(content)}</div>`;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `<div class="message-bubble typing-indicator"><span></span><span></span><span></span></div>`;
  chatContainer.appendChild(div);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return div;
}

function removeTyping(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
