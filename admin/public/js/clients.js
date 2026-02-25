// ─── Clients Page ───

async function load_clients() {
  try {
    const clients = await api('/clients');
    const tbody = document.getElementById('clients-table-body');

    if (clients.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>尚無客戶</p></td></tr>';
      return;
    }

    tbody.innerHTML = clients.map(c => `
      <tr>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td>${escapeHtml(c.company || '-')}</td>
        <td>${escapeHtml(c.contact_email || '-')}</td>
        <td>${escapeHtml(c.contact_phone || '-')}</td>
        <td>${formatDate(c.created_at)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editClient('${c.id}')">編輯</button>
          <button class="btn btn-danger btn-sm" onclick="deleteClient('${c.id}')">刪除</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Clients load error:', err);
  }
}

function openClientModal(client) {
  document.getElementById('client-modal-title').textContent = client ? '編輯客戶' : '新增客戶';
  document.getElementById('client-id').value = client?.id || '';
  document.getElementById('client-name').value = client?.name || '';
  document.getElementById('client-company').value = client?.company || '';
  document.getElementById('client-email').value = client?.contact_email || '';
  document.getElementById('client-phone').value = client?.contact_phone || '';
  document.getElementById('client-notes').value = client?.notes || '';
  document.getElementById('client-modal').classList.add('active');
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('active');
}

async function editClient(id) {
  try {
    const client = await api(`/clients/${id}`);
    openClientModal(client);
  } catch (err) {
    alert('載入客戶資料失敗');
  }
}

async function saveClient() {
  const id = document.getElementById('client-id').value;
  const body = {
    name: document.getElementById('client-name').value.trim(),
    company: document.getElementById('client-company').value.trim(),
    contact_email: document.getElementById('client-email').value.trim(),
    contact_phone: document.getElementById('client-phone').value.trim(),
    notes: document.getElementById('client-notes').value.trim()
  };

  if (!body.name) {
    alert('請輸入客戶姓名');
    return;
  }

  try {
    if (id) {
      await api(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/clients', { method: 'POST', body: JSON.stringify(body) });
    }
    closeClientModal();
    load_clients();
  } catch (err) {
    alert('儲存失敗: ' + err.message);
  }
}

async function deleteClient(id) {
  if (!confirm('確定要刪除此客戶？相關工單不會被刪除。')) return;
  try {
    await api(`/clients/${id}`, { method: 'DELETE' });
    load_clients();
  } catch (err) {
    alert('刪除失敗: ' + err.message);
  }
}

// Make functions available globally
window.openClientModal = openClientModal;
window.closeClientModal = closeClientModal;
window.editClient = editClient;
window.saveClient = saveClient;
window.deleteClient = deleteClient;
window.load_clients = load_clients;
