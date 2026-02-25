// ─── 系統設定頁面邏輯 ───

const SETTING_KEYS = [
  { key: 'bot_name', label: 'Bot 顯示名稱', type: 'text', placeholder: '專案助理' },
  { key: 'admin_line_user_id', label: '管理者 LINE User ID', type: 'text', placeholder: 'Uxxxxxxx（用於接收新工單通知）' },
  { key: 'default_greeting', label: '問卷開場白（選填）', type: 'textarea', placeholder: '自訂 Bot 開場白' },
  { key: 'auto_quote_enabled', label: '是否啟用自動報價', type: 'toggle', placeholder: '' },
];

let currentSettings = {};

async function load_settings() {
  try {
    currentSettings = await api('/api/settings');
    renderSettings();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function renderSettings() {
  const container = document.getElementById('settings-form-container');
  if (!container) return;

  container.innerHTML = SETTING_KEYS.map(s => {
    const value = currentSettings[s.key] || '';

    if (s.type === 'toggle') {
      const checked = value === 'true' || value === '1' ? 'checked' : '';
      return `
        <div class="form-group">
          <label>${escapeHtml(s.label)}</label>
          <label class="toggle-label">
            <input type="checkbox" data-setting-key="${s.key}" ${checked} onchange="toggleSetting('${s.key}', this.checked)">
            <span>${checked ? '已啟用' : '未啟用'}</span>
          </label>
        </div>
      `;
    }

    if (s.type === 'textarea') {
      return `
        <div class="form-group">
          <label>${escapeHtml(s.label)}</label>
          <textarea class="form-control" data-setting-key="${s.key}" placeholder="${s.placeholder}" rows="3">${escapeHtml(value)}</textarea>
        </div>
      `;
    }

    return `
      <div class="form-group">
        <label>${escapeHtml(s.label)}</label>
        <input type="text" class="form-control" data-setting-key="${s.key}" value="${escapeHtml(value)}" placeholder="${s.placeholder}">
      </div>
    `;
  }).join('') + `
    <div style="margin-top:24px">
      <button class="btn btn-primary" onclick="saveAllSettings()">儲存設定</button>
      <span id="settings-save-status" style="margin-left:12px;color:#22c55e;display:none">已儲存</span>
    </div>
  `;
}

async function toggleSetting(key, checked) {
  await saveSetting(key, checked ? 'true' : 'false');
  const span = document.querySelector(`[data-setting-key="${key}"]`)?.parentElement?.querySelector('span');
  if (span) span.textContent = checked ? '已啟用' : '未啟用';
}

async function saveSetting(key, value) {
  try {
    await api('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    currentSettings[key] = value;
  } catch (err) {
    console.error('Failed to save setting:', err);
  }
}

async function saveAllSettings() {
  const inputs = document.querySelectorAll('[data-setting-key]');
  for (const input of inputs) {
    const key = input.dataset.settingKey;
    const value = input.type === 'checkbox' ? (input.checked ? 'true' : 'false') : input.value;

    if (value !== (currentSettings[key] || '')) {
      await saveSetting(key, value);
    }
  }

  const status = document.getElementById('settings-save-status');
  if (status) {
    status.style.display = 'inline';
    setTimeout(() => { status.style.display = 'none'; }, 2000);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
