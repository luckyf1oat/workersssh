// Dashboard page - Connection management

// Quick commands list
const QUICK_COMMANDS = [
  'ls -la',
  'df -h',
  'free -m',
  'top -bn1 | head -20',
  'ps aux --sort=-%mem | head -10',
  'netstat -tlnp',
  'whoami',
  'uptime',
  'uname -a',
  'cat /etc/os-release',
  'docker ps',
  'systemctl list-units --type=service --state=running',
];

async function renderDashboard() {
  const app = document.getElementById('app');
  
  app.innerHTML = `
    <div class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1>🔌 WorkersSSH</h1>
          <div class="subtitle">SSH 连接管理</div>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" onclick="showAddModal()">➕ 添加连接</button>
          <button class="btn btn-sm" style="background: var(--bg-card); color: var(--text-secondary);" onclick="renderAuthPage()">🚪 退出</button>
        </div>
      </div>
      <div id="connections-list">
        <div class="loading"><div class="spinner"></div> 正在加载连接列表...</div>
      </div>
    </div>
  `;
  
  await loadConnections();
}

async function loadConnections() {
  const container = document.getElementById('connections-list');
  
  try {
    const connections = await api('/api/connections');
    
    if (connections.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🖥️</span>
          <h2>还没有 SSH 连接</h2>
          <p>添加你的第一个服务器连接</p>
          <button class="btn btn-primary" onclick="showAddModal()">➕ 添加连接</button>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `<div class="cards-grid"></div>`;
    const grid = container.querySelector('.cards-grid');
    
    connections.forEach(conn => {
      const card = createConnectionCard(conn);
      grid.appendChild(card);
    });
    
    // Check all statuses in background
    connections.forEach(conn => checkConnectionStatus(conn.id));
    
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">❌</span>
        <h2>加载失败</h2>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" onclick="loadConnections()">🔄 重试</button>
      </div>
    `;
  }
}

function createConnectionCard(conn) {
  const card = document.createElement('div');
  card.className = 'connection-card';
  card.id = `conn-${conn.id}`;
  
  const statusColor = conn.status === 'online' ? 'online' : 'offline';
  
  card.innerHTML = `
    <div class="card-header">
      <div class="card-name" onclick="startRename('${conn.id}')" title="点击改名">${escapeHtml(conn.name)}</div>
      <div class="card-actions">
        <button class="btn-icon" onclick="openTerminal('${conn.id}')" title="打开终端">▶️</button>
        <button class="btn-icon" onclick="showEditModal('${conn.id}')" title="编辑">✏️</button>
        <button class="btn-icon danger" onclick="showDeleteConfirm('${conn.id}')" title="删除">🗑️</button>
      </div>
    </div>
    <div class="card-info">
      <div class="card-info-item">
        <span class="label">主机</span>
        <span>${escapeHtml(conn.host)}:${conn.port}</span>
      </div>
      <div class="card-info-item">
        <span class="label">用户</span>
        <span>${escapeHtml(conn.username)}</span>
        ${conn.hasPassword ? '<span style="color: var(--text-muted);">🔑</span>' : ''}
      </div>
      <div class="card-info-item">
        <span class="label">创建</span>
        <span>${formatDate(conn.createdAt)}</span>
      </div>
    </div>
    <div class="card-status">
      <span class="status-dot checking" id="status-dot-${conn.id}"></span>
      <span id="status-text-${conn.id}">检测中...</span>
      <span id="status-flag-${conn.id}" style="margin-left: auto;"></span>
    </div>
  `;
  
  // Open terminal on double click
  card.addEventListener('dblclick', () => openTerminal(conn.id));
  
  return card;
}

async function checkConnectionStatus(connId) {
  const dot = document.getElementById(`status-dot-${connId}`);
  const text = document.getElementById(`status-text-${connId}`);
  const flag = document.getElementById(`status-flag-${connId}`);
  
  if (!dot) return;
  
  try {
    const data = await api(`/api/check/${connId}`);
    
    if (dot) {
      dot.className = `status-dot ${data.reachable ? 'online' : 'offline'}`;
      text.textContent = data.reachable ? '在线' : '离线';
      
      if (data.countryFlag) {
        flag.textContent = `${data.countryFlag} ${data.countryName || ''}`;
        flag.title = `${data.city || ''} ${data.region || ''} • ${data.isp || ''}`;
      } else {
        flag.textContent = '🌐';
      }
    }
  } catch (err) {
    if (dot) {
      dot.className = 'status-dot offline';
      text.textContent = '检测失败';
    }
  }
}

function startRename(connId) {
  const card = document.getElementById(`conn-${connId}`);
  const nameEl = card.querySelector('.card-name');
  const currentName = nameEl.textContent.trim();
  
  const input = document.createElement('input');
  input.className = 'card-name-input';
  input.value = currentName;
  input.autofocus = true;
  
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  
  async function saveRename() {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      try {
        await api(`/api/connections/${connId}/rename`, {
          method: 'PATCH',
          body: JSON.stringify({ name: newName }),
        });
        showToast('✅ 已重命名', 'success');
      } catch (err) {
        showToast('❌ ' + err.message, 'error');
      }
    }
    
    const newNameEl = document.createElement('div');
    newNameEl.className = 'card-name';
    newNameEl.textContent = newName || currentName;
    newNameEl.onclick = () => startRename(connId);
    newNameEl.title = '点击改名';
    
    input.replaceWith(newNameEl);
  }
  
  input.addEventListener('blur', saveRename);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    if (e.key === 'Escape') {
      input.value = currentName;
      input.blur();
    }
  });
}

// Modal functions
function showAddModal() {
  showConnectionModal(null);
}

function showEditModal(connId) {
  showConnectionModal(connId);
}

async function showConnectionModal(connId) {
  const isEdit = !!connId;
  let conn = null;
  
  if (isEdit) {
    try {
      conn = await api(`/api/connections/${connId}`);
    } catch (err) {
      showToast('❌ 无法加载连接信息', 'error');
      return;
    }
  }
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  overlay.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <h2>${isEdit ? '✏️ 编辑连接' : '➕ 添加连接'}</h2>
      <div class="form-group">
        <label>名称</label>
        <input type="text" id="modal-name" placeholder="例如: 我的服务器" value="${escapeHtml(conn?.name || '')}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>主机地址</label>
          <input type="text" id="modal-host" placeholder="IP或域名" value="${escapeHtml(conn?.host || '')}">
        </div>
        <div class="form-group">
          <label>端口</label>
          <input type="number" id="modal-port" placeholder="22" value="${conn?.port || 22}">
        </div>
      </div>
      <div class="form-group">
        <label>用户名</label>
        <input type="text" id="modal-username" placeholder="root" value="${escapeHtml(conn?.username || '')}">
      </div>
      <div class="form-group">
        <label>认证方式</label>
        <select id="modal-auth-type" onchange="toggleAuthFields()">
          <option value="password" ${conn?.authType === 'key' ? '' : 'selected'}>密码</option>
          <option value="key" ${conn?.authType === 'key' ? 'selected' : ''}>密钥</option>
        </select>
      </div>
      <div class="form-group" id="auth-password-field">
        <label>密码</label>
        <input type="password" id="modal-password" placeholder="${isEdit ? '留空则不修改' : 'SSH密码'}" value="">
      </div>
      <div class="form-group" id="auth-key-field" style="display: ${conn?.authType === 'key' ? 'block' : 'none'};">
        <label>私钥 (PEM格式)</label>
        <textarea id="modal-privatekey" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----
...">${escapeHtml(conn?.privateKey || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm" style="background: var(--bg-card); color: var(--text-secondary);" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary btn-sm" onclick="saveConnection('${connId || ''}')">
          ${isEdit ? '💾 保存' : '✅ 添加'}
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
  
  setTimeout(() => document.getElementById('modal-name').focus(), 100);
}

function toggleAuthFields() {
  const type = document.getElementById('modal-auth-type').value;
  document.getElementById('auth-password-field').style.display = type === 'password' ? 'block' : 'none';
  document.getElementById('auth-key-field').style.display = type === 'key' ? 'block' : 'none';
}

async function saveConnection(connId) {
  const isEdit = !!connId;
  const name = document.getElementById('modal-name').value.trim();
  const host = document.getElementById('modal-host').value.trim();
  const port = parseInt(document.getElementById('modal-port').value) || 22;
  const username = document.getElementById('modal-username').value.trim();
  const authType = document.getElementById('modal-auth-type').value;
  const password = document.getElementById('modal-password').value;
  const privateKey = document.getElementById('modal-privatekey').value;
  
  if (!name || !host || !username) {
    showToast('请填写名称、主机地址和用户名', 'error');
    return;
  }
  
  if (authType === 'password' && !password && !isEdit) {
    showToast('请输入密码', 'error');
    return;
  }
  
  const btn = document.querySelector('.modal .btn-primary');
  btn.disabled = true;
  btn.textContent = '⏳ 保存中...';
  
  try {
    if (isEdit) {
      await api(`/api/connections/${connId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, host, port, username, authType, password, privateKey }),
      });
      showToast('✅ 已更新', 'success');
    } else {
      await api('/api/connections', {
        method: 'POST',
        body: JSON.stringify({ name, host, port, username, authType, password, privateKey }),
      });
      showToast('✅ 已添加', 'success');
    }
    
    document.querySelector('.modal-overlay').remove();
    await loadConnections();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = isEdit ? '💾 保存' : '✅ 添加';
  }
}

function showDeleteConfirm(connId) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  overlay.innerHTML = `
    <div class="modal" onclick="event.stopPropagation()">
      <h2>🗑️ 确认删除</h2>
      <p style="color: var(--text-secondary); margin-bottom: 24px;">
        确定要删除这个 SSH 连接吗？此操作无法撤销。
      </p>
      <div class="modal-actions">
        <button class="btn btn-sm" style="background: var(--bg-card); color: var(--text-secondary);" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-sm btn-danger" onclick="deleteConnection('${connId}')">🗑️ 删除</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
}

async function deleteConnection(connId) {
  try {
    await api(`/api/connections/${connId}`, { method: 'DELETE' });
    showToast('✅ 已删除', 'success');
    document.querySelector('.modal-overlay').remove();
    await loadConnections();
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

function openTerminal(connId) {
  renderTerminal(connId);
}

// Expose functions globally for onclick handlers
window.QUICK_COMMANDS = QUICK_COMMANDS;