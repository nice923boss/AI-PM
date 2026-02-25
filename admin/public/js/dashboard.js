// ─── Dashboard Page ───

async function load_dashboard() {
  try {
    const data = await api('/dashboard');

    document.getElementById('stat-clients').textContent = data.stats.activeClients;
    document.getElementById('stat-tickets').textContent = data.stats.activeTickets;
    document.getElementById('stat-conversations').textContent = data.stats.recentConversations;
    document.getElementById('stat-urgent').textContent = data.stats.urgentCount;

    const tbody = document.getElementById('dashboard-tickets-body');
    if (data.recentTickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>尚無工單</p></td></tr>';
      return;
    }

    tbody.innerHTML = data.recentTickets.map(t => `
      <tr style="cursor:pointer" onclick="navigateTo('tickets')">
        <td><strong>${escapeHtml(t.title)}</strong></td>
        <td>${escapeHtml(t.client_name || '-')}${t.client_company ? ` (${escapeHtml(t.client_company)})` : ''}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${priorityBadge(t.priority)}</td>
        <td>${formatDate(t.created_at)}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Make escapeHtml available globally
window.escapeHtml = escapeHtml;
