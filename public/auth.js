// Auth page logic

function renderAuthPage() {
  const app = document.getElementById('app');
  
  app.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <span class="logo-icon">🔐</span>
        <h1>WorkersSSH</h1>
        <p>Cloudflare Workers SSH 管理工具</p>
        <div id="auth-form"></div>
      </div>
    </div>
  `;
  
  checkAuthState();
}

async function checkAuthState() {
  const formContainer = document.getElementById('auth-form');
  
  try {
    const data = await api('/api/auth/check');
    
    if (data.hasPassword) {
      renderLoginForm(formContainer);
    } else {
      renderSetupForm(formContainer);
    }
  } catch (err) {
    formContainer.innerHTML = `
      <div class="form-group">
        <p style="color: var(--danger); text-align: center;">
          ❌ 无法连接到服务器
        </p>
        <p style="color: var(--text-secondary); text-align: center; font-size: 13px; margin-top: 8px;">
          ${escapeHtml(err.message)}
        </p>
        <button class="btn btn-primary" onclick="checkAuthState()" style="margin-top: 16px;">
          🔄 重试
        </button>
      </div>
    `;
  }
}

function renderLoginForm(container) {
  container.innerHTML = `
    <div class="form-group">
      <label>登录密码</label>
      <input type="password" id="password-input" placeholder="请输入密码" autocomplete="current-password" autofocus>
    </div>
    <button class="btn btn-primary" onclick="handleLogin()">
      🔓 验证
    </button>
  `;
  
  // Enter key support
  document.getElementById('password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  
  // Auto focus
  setTimeout(() => document.getElementById('password-input').focus(), 100);
}

function renderSetupForm(container) {
  container.innerHTML = `
    <p style="color: var(--text-secondary); margin-bottom: 20px;">
      👋 首次使用！请设置一个访问密码
    </p>
    <div class="form-group">
      <label>设置密码</label>
      <input type="password" id="password-input" placeholder="输入密码" autocomplete="new-password" autofocus>
    </div>
    <div class="form-group">
      <label>确认密码</label>
      <input type="password" id="password-confirm" placeholder="再次输入密码" autocomplete="new-password">
    </div>
    <button class="btn btn-primary" onclick="handleSetup()">
      ✅ 设置密码
    </button>
  `;
  
  // Enter key support
  document.getElementById('password-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('password-confirm').focus();
  });
  document.getElementById('password-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSetup();
  });
  
  setTimeout(() => document.getElementById('password-input').focus(), 100);
}

async function handleLogin() {
  const password = document.getElementById('password-input').value;
  const btn = document.querySelector('.btn-primary');
  
  if (!password) {
    showToast('请输入密码', 'error');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = '⏳ 验证中...';
  
  try {
    const data = await api('/api/auth/check-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    
    if (data.success) {
      sessionStorage.setItem('auth_token', data.token);
      showToast('✅ 验证成功', 'success');
      renderDashboard();
    } else {
      showToast('❌ ' + (data.error || '密码错误'), 'error');
      btn.disabled = false;
      btn.textContent = '🔓 验证';
      document.getElementById('password-input').value = '';
      document.getElementById('password-input').focus();
    }
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '🔓 验证';
  }
}

async function handleSetup() {
  const password = document.getElementById('password-input').value;
  const confirm = document.getElementById('password-confirm').value;
  const btn = document.querySelector('.btn-primary');
  
  if (!password) {
    showToast('请输入密码', 'error');
    return;
  }
  
  if (password !== confirm) {
    showToast('两次密码输入不一致', 'error');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = '⏳ 设置中...';
  
  try {
    const data = await api('/api/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    
    if (data.success) {
      showToast('✅ 密码设置成功', 'success');
      // Now log in with the new password
      handleLogin();
    } else {
      showToast('❌ ' + (data.error || '设置失败'), 'error');
      btn.disabled = false;
      btn.textContent = '✅ 设置密码';
    }
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '✅ 设置密码';
  }
}