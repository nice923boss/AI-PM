// ─── Skills Page ───

const PRICING_TIER_LABELS = {
  basic: '基礎',
  standard: '標準',
  premium: '進階'
};

async function load_skills() {
  try {
    const category = document.getElementById('skill-filter-category')?.value || '';
    const query = category ? `?category=${category}` : '';
    const skills = await api(`/skills${query}`);
    const grid = document.getElementById('skills-grid');

    if (skills.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">&#9733;</div>
          <p>尚無 Skill，點擊「新增 Skill」開始建立知識庫</p>
        </div>`;
      return;
    }

    grid.innerHTML = skills.map(s => `
      <div class="card">
        <div class="card-header">
          <span>${escapeHtml(s.display_name)}</span>
          <span class="badge badge-${s.is_active ? 'delivered' : 'closed'}">${s.is_active ? '啟用中' : '已停用'}</span>
        </div>
        <div class="card-body">
          <div style="margin-bottom:8px">
            <span class="badge" style="background:var(--primary-light);color:var(--primary)">${CATEGORY_LABELS[s.category] || s.category}</span>
            <span class="badge" style="background:var(--surface-alt);color:var(--text-secondary)">${PRICING_TIER_LABELS[s.pricing_tier] || s.pricing_tier}</span>
          </div>
          <p style="font-size:.875rem;color:var(--text-secondary);margin-bottom:12px">${escapeHtml(s.description || '尚無描述')}</p>
          ${s.base_price ? `<p style="font-size:.9375rem;font-weight:600">基礎報價：NT$ ${s.base_price.toLocaleString()}</p>` : ''}
          ${s.demo_url ? `<a href="${escapeHtml(s.demo_url)}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:8px">Demo</a>` : ''}
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="editSkill('${s.id}')">編輯</button>
            <button class="btn btn-sm" style="background:var(--danger);color:#fff" onclick="deleteSkill('${s.id}','${escapeHtml(s.display_name)}')">刪除</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Skills load error:', err);
  }
}

function openSkillModal(skill) {
  document.getElementById('skill-modal-title').textContent = skill ? '編輯 Skill' : '新增 Skill';
  document.getElementById('skill-id').value = skill?.id || '';
  document.getElementById('skill-name').value = skill?.name || '';
  document.getElementById('skill-display-name').value = skill?.display_name || '';
  document.getElementById('skill-category').value = skill?.category || 'hr_training';
  document.getElementById('skill-description').value = skill?.description || '';
  document.getElementById('skill-demo-url').value = skill?.demo_url || '';
  document.getElementById('skill-pricing-tier').value = skill?.pricing_tier || 'standard';
  document.getElementById('skill-base-price').value = skill?.base_price || '';
  document.getElementById('skill-modal').classList.add('active');
}

function closeSkillModal() {
  document.getElementById('skill-modal').classList.remove('active');
}

async function editSkill(id) {
  try {
    const skill = await api(`/skills/${id}`);
    openSkillModal(skill);
  } catch (err) {
    alert('載入 Skill 失敗');
  }
}

async function saveSkill() {
  const id = document.getElementById('skill-id').value;
  const basePrice = document.getElementById('skill-base-price').value;

  const body = {
    name: document.getElementById('skill-name').value.trim(),
    display_name: document.getElementById('skill-display-name').value.trim(),
    category: document.getElementById('skill-category').value,
    description: document.getElementById('skill-description').value.trim(),
    demo_url: document.getElementById('skill-demo-url').value.trim(),
    pricing_tier: document.getElementById('skill-pricing-tier').value,
    base_price: basePrice ? parseInt(basePrice, 10) : null
  };

  if (!body.name || !body.display_name) {
    alert('請填寫 Skill 名稱');
    return;
  }

  try {
    if (id) {
      await api(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/skills', { method: 'POST', body: JSON.stringify(body) });
    }
    closeSkillModal();
    load_skills();
  } catch (err) {
    alert('儲存失敗: ' + err.message);
  }
}

async function deleteSkill(id, name) {
  if (!confirm(`確定要刪除「${name}」嗎？此操作無法復原。`)) return;
  try {
    await api(`/skills/${id}`, { method: 'DELETE' });
    load_skills();
  } catch (err) {
    alert('刪除失敗: ' + err.message);
  }
}

window.openSkillModal = openSkillModal;
window.closeSkillModal = closeSkillModal;
window.editSkill = editSkill;
window.saveSkill = saveSkill;
window.deleteSkill = deleteSkill;
window.load_skills = load_skills;
