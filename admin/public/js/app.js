// ─── State ───
let authToken = localStorage.getItem('ai-pm-token');

// ─── DOM References ───
const loginContainer = document.getElementById('login-container');
const appLayout = document.getElementById('app-layout');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const passwordInput = document.getElementById('password-input');
const navLinks = document.querySelectorAll('.sidebar-nav a[data-page]');
const pageSections = document.querySelectorAll('.page-section');
const logoutBtn = document.getElementById('logout-btn');
const notificationBadge = document.getElementById('notification-badge');

// ─── API Helper ───
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });

  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'API error');
  }
  return data;
}

// ─── Auth ───
function showApp() {
  loginContainer.style.display = 'none';
  appLayout.style.display = 'block';
  navigateTo(location.hash.slice(2) || 'dashboard');
}

function showLogin() {
  loginContainer.style.display = '';
  appLayout.style.display = 'none';
  passwordInput.value = '';
  loginError.style.display = 'none';
}

function logout() {
  authToken = null;
  localStorage.removeItem('ai-pm-token');
  showLogin();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';

  try {
    const data = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value })
    }).then(r => r.json());

    if (data.token) {
      authToken = data.token;
      localStorage.setItem('ai-pm-token', authToken);
      showApp();
    } else {
      loginError.textContent = data.error || '登入失敗';
      loginError.style.display = 'block';
    }
  } catch (err) {
    loginError.textContent = '連線失敗，請稍後再試';
    loginError.style.display = 'block';
  }
});

logoutBtn.addEventListener('click', logout);

// ─── Navigation ───
function navigateTo(page) {
  location.hash = `#/${page}`;

  navLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  pageSections.forEach(section => {
    section.classList.toggle('active', section.id === `page-${page}`);
  });

  // Load page data
  if (typeof window[`load_${page}`] === 'function') {
    window[`load_${page}`]();
  }
}

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.page);
  });
});

window.addEventListener('hashchange', () => {
  const page = location.hash.slice(2) || 'dashboard';
  navigateTo(page);
});

// ─── Status Label Helpers ───
const STATUS_LABELS = {
  collecting: '需求收集中',
  quoted: '已報價',
  pending_payment: '待付款',
  developing: '開發中',
  testing: '測試中',
  delivered: '已交付',
  closed: '已結案'
};

const PRIORITY_LABELS = {
  urgent: '緊急',
  normal: '一般',
  low: '低'
};

const CATEGORY_LABELS = {
  hr_training: 'HR / 內訓',
  marketing: '行銷推廣',
  strategy: '商業策略'
};

function statusBadge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
}

function priorityBadge(priority) {
  return `<span class="badge badge-${priority}">${PRIORITY_LABELS[priority] || priority}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Notification Polling ───
async function pollNotifications() {
  try {
    const data = await api('/dashboard');
    const count = data.unreadNotifications?.length || 0;
    notificationBadge.textContent = count;
    notificationBadge.style.display = count > 0 ? '' : 'none';
  } catch (_) {
    // Ignore polling errors
  }
}

// ─── Init ───
if (authToken) {
  showApp();
} else {
  showLogin();
}

// Poll notifications every 30 seconds
setInterval(pollNotifications, 30000);
