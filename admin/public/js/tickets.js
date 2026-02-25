// ─── Tickets Page ───

async function load_tickets() {
  try {
    const status = document.getElementById('ticket-filter-status')?.value || '';
    const query = status ? `?status=${status}` : '';
    const tickets = await api(`/tickets${query}`);
    const tbody = document.getElementById('tickets-table-body');

    if (tickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>尚無工單</p></td></tr>';
      return;
    }

    tbody.innerHTML = tickets.map(t => `
      <tr>
        <td><strong>${escapeHtml(t.title)}</strong></td>
        <td>${escapeHtml(t.client_name || '-')}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${priorityBadge(t.priority)}</td>
        <td>${t.price ? `NT$ ${t.price.toLocaleString()}` : '-'}</td>
        <td>${formatDate(t.created_at)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editTicket('${t.id}')">編輯</button>
          <button class="btn btn-sm" style="background:var(--primary-light);color:var(--primary)" onclick="changeTicketStatus('${t.id}', '${t.status}')">變更狀態</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Tickets load error:', err);
  }
}

async function loadClientOptions() {
  try {
    const clients = await api('/clients');
    const select = document.getElementById('ticket-client');
    select.innerHTML = '<option value="">請選擇客戶</option>' +
      clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ` (${escapeHtml(c.company)})` : ''}</option>`).join('');
  } catch (_) {
    // Ignore
  }
}

function openTicketModal(ticket) {
  document.getElementById('ticket-modal-title').textContent = ticket ? '編輯工單' : '新增工單';
  document.getElementById('ticket-id').value = ticket?.id || '';
  document.getElementById('ticket-title').value = ticket?.title || '';
  document.getElementById('ticket-priority').value = ticket?.priority || 'normal';
  document.getElementById('ticket-price').value = ticket?.price || '';
  document.getElementById('ticket-notes').value = ticket?.admin_notes || '';

  const req = ticket?.requirement_json ? JSON.parse(ticket.requirement_json) : null;
  document.getElementById('ticket-requirement').value = req
    ? Object.entries(req).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '';

  loadClientOptions().then(() => {
    if (ticket?.client_id) {
      document.getElementById('ticket-client').value = ticket.client_id;
    }
  });

  document.getElementById('ticket-modal').classList.add('active');
}

function closeTicketModal() {
  document.getElementById('ticket-modal').classList.remove('active');
}

async function editTicket(id) {
  try {
    const ticket = await api(`/tickets/${id}`);
    openTicketModal(ticket);
  } catch (err) {
    alert('載入工單失敗');
  }
}

async function saveTicket() {
  const id = document.getElementById('ticket-id').value;
  const requirementText = document.getElementById('ticket-requirement').value.trim();
  const price = document.getElementById('ticket-price').value;

  const body = {
    title: document.getElementById('ticket-title').value.trim(),
    client_id: document.getElementById('ticket-client').value,
    priority: document.getElementById('ticket-priority').value,
    requirement_json: requirementText ? JSON.stringify({ description: requirementText }) : null,
    price: price ? parseInt(price, 10) : null,
    admin_notes: document.getElementById('ticket-notes').value.trim()
  };

  if (!body.title || !body.client_id) {
    alert('請填寫工單標題並選擇客戶');
    return;
  }

  try {
    if (id) {
      await api(`/tickets/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/tickets', { method: 'POST', body: JSON.stringify(body) });
    }
    closeTicketModal();
    load_tickets();
  } catch (err) {
    alert('儲存失敗: ' + err.message);
  }
}

async function changeTicketStatus(id, currentStatus) {
  const statusFlow = ['collecting', 'quoted', 'pending_payment', 'developing', 'testing', 'delivered', 'closed'];
  const currentIdx = statusFlow.indexOf(currentStatus);

  const options = statusFlow.map((s, i) => {
    const label = STATUS_LABELS[s];
    const marker = i === currentIdx ? ' (目前)' : '';
    return `${i}: ${label}${marker}`;
  }).join('\n');

  const choice = prompt(`請選擇新狀態（輸入數字）：\n\n${options}`);
  if (choice === null) return;

  const idx = parseInt(choice, 10);
  if (isNaN(idx) || idx < 0 || idx >= statusFlow.length) {
    alert('無效的選擇');
    return;
  }

  try {
    await api(`/tickets/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: statusFlow[idx] })
    });
    load_tickets();
    pollNotifications();
  } catch (err) {
    alert('狀態變更失敗: ' + err.message);
  }
}

window.openTicketModal = openTicketModal;
window.closeTicketModal = closeTicketModal;
window.editTicket = editTicket;
window.saveTicket = saveTicket;
window.changeTicketStatus = changeTicketStatus;
window.load_tickets = load_tickets;
