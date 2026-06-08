// Terminal page - xterm.js SSH terminal

let term = null;
let fitAddon = null;
let ws = null;
let currentConnId = null;
let currentConn = null;
let terminalHistory = [];
let historyIndex = -1;
let currentInput = '';
let selectionTimeout = null;

// Password input state
let isPasswordInput = false;
let passwordBuffer = '';

async function renderTerminal(connId) {
  currentConnId = connId;
  
  // Get connection details
  try {
    currentConn = await api(`/api/connections/${connId}`);
  } catch (err) {
    showToast('❌ 无法获取连接信息', 'error');
    return;
  }
  
  const app = document.getElementById('app');
  
  app.innerHTML = `
    <div class="terminal-page">
      <div class="terminal-toolbar">
        <div class="conn-info">
          <button class="btn-icon" onclick="renderDashboard()" title="返回">◀</button>
          <span class="username">${escapeHtml(currentConn.username)}</span>
          <span class="hostname">@ ${escapeHtml(currentConn.host)}:${currentConn.port}</span>
          <span class="flag-emoji" id="terminal-flag"></span>
        </div>
        <div class="toolbar-actions">
          <button class="btn-icon" onclick="showQuickCommands()" title="快捷命令">⚡</button>
          <button class="btn-icon" onclick="copySelection()" title="复制选中">📋</button>
          <button class="btn-icon" onclick="clearTerminal()" title="清屏">🧹</button>
          <button class="btn-icon" onclick="reconnectTerminal()" title="重新连接">🔄</button>
        </div>
      </div>
      <div class="terminal-container">
        <div id="terminal"></div>
      </div>
      <div class="quick-commands" id="quick-commands-bar">
        <span style="color: var(--text-muted); font-size: 12px; white-space: nowrap;">⚡ 快捷命令:</span>
      </div>
    </div>
  `;
  
  // Initialize terminal
  initTerminal();
  
  // Connect WebSocket
  connectWebSocket();
  
  // Load quick commands
  loadQuickCommands();
  
  // Check IP info in background
  checkIpInfo();
}

function initTerminal() {
  // Destroy existing terminal if any
  if (term) {
    term.dispose();
    term = null;
  }
  
  const terminalContainer = document.getElementById('terminal');
  
  // Create xterm.js instance
  term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
    theme: {
      background: '#0d0e1a',
      foreground: '#e8e9f3',
      cursor: '#6c63ff',
      selectionBackground: 'rgba(108, 99, 255, 0.4)',
      black: '#1a1b2e',
      red: '#ff6b6b',
      green: '#4caf7d',
      yellow: '#ffd93d',
      blue: '#6c63ff',
      magenta: '#a78bfa',
      cyan: '#64d8e6',
      white: '#e8e9f3',
      brightBlack: '#6b70a0',
      brightRed: '#ff6b6b',
      brightGreen: '#4caf7d',
      brightYellow: '#ffd93d',
      brightBlue: '#6c63ff',
      brightMagenta: '#a78bfa',
      brightCyan: '#64d8e6',
      brightWhite: '#e8e9f3',
    },
    allowTransparency: true,
    cols: 80,
    rows: 24,
  });
  
  // Fit addon
  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  
  // Open terminal
  term.open(terminalContainer);
  
  // Fit terminal to container
  setTimeout(() => {
    try {
      fitAddon.fit();
    } catch (e) {}
  }, 50);
  
  // Handle resize
  window.addEventListener('resize', () => {
    try {
      fitAddon.fit();
    } catch (e) {}
  });
  
  // Handle input
  term.onData((data) => {
    handleTerminalInput(data);
  });
  
  // Handle selection (auto-copy)
  term.onSelectionChange(() => {
    if (selectionTimeout) clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(() => {
      autoCopySelection();
    }, 200);
  });
  
  // Show welcome message
  term.writeln('\x1b[1;35m╔══════════════════════════════════════╗\x1b[0m');
  term.writeln('\x1b[1;35m║      WorkersSSH Terminal v1.0       ║\x1b[0m');
  term.writeln('\x1b[1;35m╚══════════════════════════════════════╝\x1b[0m');
  term.writeln('');
  term.writeln(`\x1b[2mConnecting to ${currentConn?.username}@${currentConn?.host}:${currentConn?.port}...\x1b[0m`);
  term.writeln('');
}

function connectWebSocket() {
  const token = sessionStorage.getItem('auth_token');
  if (!token) {
    term.writeln('\x1b[1;31m✗ Authentication token not found. Please login again.\x1b[0m');
    return;
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?id=${currentConnId}&token=${token}`;
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      term.writeln('\x1b[1;32m✓ WebSocket connected\x1b[0m');
      term.writeln('');
      
      // Send SSH authentication
      sendSshAuth();
    };
    
    ws.onmessage = (event) => {
      handleWsMessage(event);
    };
    
    ws.onclose = (event) => {
      term.writeln('');
      term.writeln(`\x1b[1;31m✗ Connection closed (${event.code})\x1b[0m`);
      term.writeln('\x1b[2mPress [R] to reconnect, [ESC] to go back\x1b[0m');
    };
    
    ws.onerror = (error) => {
      term.writeln(`\x1b[1;31m✗ WebSocket error\x1b[0m`);
    };
  } catch (err) {
    term.writeln(`\x1b[1;31m✗ Failed to connect: ${err.message}\x1b[0m`);
  }
}

function sendSshAuth() {
  // In this pure browser-based approach, we send the credentials to the WebSocket
  // The browser-side SSH client will handle the SSH protocol
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  
  const authMsg = {
    type: 'ssh_auth',
    username: currentConn.username,
    authType: currentConn.authType,
    password: currentConn.password || '',
    privateKey: currentConn.privateKey || '',
    host: currentConn.host,
    port: currentConn.port,
  };
  
  ws.send(JSON.stringify(authMsg));
}

function handleWsMessage(event) {
  if (typeof event.data === 'string') {
    try {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'ssh_auth_response') {
        if (msg.success) {
          term.writeln('\x1b[1;32m✓ SSH credentials sent\x1b[0m');
          term.writeln('\x1b[2mWaiting for SSH banner...\x1b[0m');
        } else {
          term.writeln(`\x1b[1;31m✗ Authentication failed: ${msg.error}\x1b[0m`);
        }
      } else if (msg.type === 'proxy_data') {
        // Handle base64 encoded binary data from SSH
        if (msg.data) {
          try {
            const binary = atob(msg.data);
            const arr = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              arr[i] = binary.charCodeAt(i);
            }
            term.write(arr);
          } catch (e) {
            // Not binary data, write as string
            term.write(msg.data);
          }
        }
      } else if (msg.type === 'resize_ack') {
        // Resize acknowledged
      } else {
        // Regular message, write to terminal
        term.write(msg.data || JSON.stringify(msg));
      }
    } catch {
      // Not JSON, write raw string to terminal
      term.write(event.data);
    }
  } else {
    // Binary data from WebSocket
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        term.write(new Uint8Array(reader.result));
      }
    };
    reader.readAsArrayBuffer(event.data);
  }
}

function handleTerminalInput(data) {
  // Handle password input mode
  if (isPasswordInput && data !== '\r' && data !== '\n') {
    if (data === '\x7f') { // Backspace
      if (passwordBuffer.length > 0) {
        passwordBuffer = passwordBuffer.slice(0, -1);
        term.write('\b \b');
      }
    } else {
      passwordBuffer += data;
      term.write('*');
    }
    return;
  }
  
  // Handle escape sequences
  if (data === '\x1b') { // ESC
    renderDashboard();
    return;
  }
  
  if (data === '\x72' || data === '\x52') { // R/r for reconnect
    reconnectTerminal();
    return;
  }
  
  // Add to history
  if (data === '\r') { // Enter
    const input = currentInput;
    if (input.trim()) {
      terminalHistory.push(input);
    }
    historyIndex = terminalHistory.length;
    currentInput = '';
  } else if (data === '\x1b[A') { // Up arrow
    if (historyIndex > 0) {
      historyIndex--;
      const prev = terminalHistory[historyIndex];
      const diff = currentInput.length - prev.length;
      term.write('\r\x1b[K');
      term.write(prev);
      currentInput = prev;
    }
    return;
  } else if (data === '\x1b[B') { // Down arrow
    if (historyIndex < terminalHistory.length - 1) {
      historyIndex++;
      const next = terminalHistory[historyIndex];
      const diff = currentInput.length - next.length;
      term.write('\r\x1b[K');
      term.write(next);
      currentInput = next;
    } else if (historyIndex === terminalHistory.length - 1) {
      historyIndex = terminalHistory.length;
      const diff = currentInput.length;
      term.write('\r\x1b[K');
      currentInput = '';
    }
    return;
  } else if (data === '\x7f') { // Backspace
    if (currentInput.length > 0) {
      currentInput = currentInput.slice(0, -1);
      term.write('\b \b');
    }
    return;
  } else {
    // Regular character
    currentInput += data;
  }
  
  // Forward to WebSocket
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ssh_data', data: btoa(data) }));
  }
}

function autoCopySelection() {
  const selection = term.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection).then(() => {
      // Visual feedback
      term.textarea.style.outline = '2px solid var(--accent)';
      setTimeout(() => {
        term.textarea.style.outline = '';
      }, 500);
    }).catch(() => {
      // Fallback: don't show error for auto-copy
    });
  }
}

function copySelection() {
  const selection = term.getSelection();
  if (selection) {
    navigator.clipboard.writeText(selection).then(() => {
      showToast('✅ 已复制到剪贴板', 'success');
    }).catch(() => {
      showToast('❌ 复制失败', 'error');
    });
  } else {
    // Copy entire visible terminal content
    const buffer = term.buffer.active;
    let text = '';
    for (let y = 0; y < buffer.length; y++) {
      const line = buffer.getLine(y);
      if (line) {
        text += line.translateToString() + '\n';
      }
    }
    navigator.clipboard.writeText(text).then(() => {
      showToast('✅ 已复制全部内容', 'success');
    });
  }
}

function clearTerminal() {
  if (term) {
    term.clear();
  }
}

function reconnectTerminal() {
  // Close existing connection
  if (ws) {
    ws.close();
    ws = null;
  }
  
  // Reinitialize
  if (term) {
    term.clear();
    term.writeln('\x1b[2mReconnecting...\x1b[0m');
  }
  
  connectWebSocket();
}

function loadQuickCommands() {
  const bar = document.getElementById('quick-commands-bar');
  if (!bar) return;
  
  QUICK_COMMANDS.forEach(cmd => {
    const btn = document.createElement('button');
    btn.className = 'cmd-btn';
    btn.textContent = cmd;
    btn.title = `发送命令: ${cmd}`;
    btn.onclick = () => sendQuickCommand(cmd);
    bar.appendChild(btn);
  });
}

function sendQuickCommand(cmd) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('❌ 未连接', 'error');
    return;
  }
  
  term.writeln('');
  term.writeln(`\x1b[1;36m$ ${cmd}\x1b[0m`);
  
  // Send command with newline
  const fullCmd = cmd + '\n';
  ws.send(JSON.stringify({ type: 'ssh_data', data: btoa(fullCmd) }));
  
  currentInput = '';
}

function showQuickCommands() {
  // Toggle quick commands bar visibility
  const bar = document.getElementById('quick-commands-bar');
  if (bar) {
    bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
  }
}

async function checkIpInfo() {
  if (!currentConn) return;
  
  try {
    const data = await api('/api/check-ip', {
      method: 'POST',
      body: JSON.stringify({ host: currentConn.host }),
    });
    
    const flagEl = document.getElementById('terminal-flag');
    if (flagEl && data.flag) {
      flagEl.textContent = data.flag;
      flagEl.title = `${data.country || ''} ${data.city || ''}`;
    }
  } catch (err) {
    // Ignore errors
  }
}