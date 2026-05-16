const startBtn = document.getElementById('startBtn');
const startBtnText = document.getElementById('startBtnText');
const clearBtn = document.getElementById('clearBtn');
const logContainer = document.getElementById('logContainer');
const totalCount = document.getElementById('totalCount');
const statusText = document.getElementById('statusText');
const exportBtn = document.getElementById('exportBtn');
const viewBtn = document.getElementById('viewBtn');
const stopBtn = document.getElementById('stopBtn');
const accountsModal = document.getElementById('accountsModal');
const accountsList = document.getElementById('accountsList');
const closeModal = document.getElementById('closeModal');
const sessionInfo = document.getElementById('sessionInfo');
const sessionDetail = document.getElementById('sessionDetail');
const codeDisplay = document.getElementById('codeDisplay');
const codeValue = document.getElementById('codeValue');
const themeToggle = document.getElementById('themeToggle');

const ICONS = {
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
};

// Theme
function loadTheme() {
  const saved = localStorage.getItem('windsurf-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('windsurf-theme', next);
}

themeToggle.addEventListener('click', toggleTheme);
loadTheme();

function addLog(message, type = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const icon = type === 'success' ? ICONS.check : type === 'error' ? ICONS.alert : ICONS.info;

  const msg = document.createElement('span');
  msg.innerHTML = `${icon} ${message}`;

  entry.appendChild(time);
  entry.appendChild(msg);
  logContainer.prepend(entry);
}

function updateStats() {
  chrome.storage.local.get({ accounts: [] }, (data) => {
    totalCount.textContent = data.accounts.length;
  });
}

function checkSession() {
  chrome.runtime.sendMessage({ action: 'getSession' }, (response) => {
    if (response && response.session) {
      sessionInfo.classList.add('visible');
      clearBtn.classList.add('visible');
      sessionDetail.textContent = `Email: ${response.session.mailAddress || 'N/A'} | Step: ${response.session.step}`;
      startBtnText.textContent = 'Resume';
      if (response.isRunning) {
        disableButtons();
      }
    } else {
      sessionInfo.classList.remove('visible');
      clearBtn.classList.remove('visible');
      startBtnText.textContent = 'Start';
    }
  });
}

function setRunning(running) {
  if (running) {
    document.body.classList.add('running');
  } else {
    document.body.classList.remove('running');
  }
}

function disableButtons() {
  startBtn.disabled = true;
  stopBtn.classList.add('visible');
  setRunning(true);
}

function enableButtons() {
  startBtn.disabled = false;
  stopBtn.classList.remove('visible');
  setRunning(false);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'log') {
    addLog(msg.text, msg.level || '');
  }
  if (msg.type === 'status') {
    statusText.textContent = msg.text;
  }
  if (msg.type === 'code') {
    codeValue.textContent = msg.code;
    codeDisplay.classList.add('visible');
    addLog(`Verification code: ${msg.code}`, 'success');
  }
  if (msg.type === 'done') {
    enableButtons();
    statusText.textContent = 'Done';
    codeDisplay.classList.remove('visible');
    updateStats();
    checkSession();
    addLog('Registration complete!', 'success');
  }
  if (msg.type === 'error') {
    enableButtons();
    statusText.textContent = 'Error';
    checkSession();
    addLog(msg.text, 'error');
  }
});

startBtn.addEventListener('click', () => {
  disableButtons();
  statusText.textContent = 'Running';
  addLog('Resuming / starting registration...', 'info');
  chrome.runtime.sendMessage({ action: 'startRegistration' });
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clearSession' }, () => {
    addLog('Session cleared', 'success');
    checkSession();
    setRunning(false);
  });
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopRegistration' }, () => {
    addLog('Stopping...', 'info');
  });
});

exportBtn.addEventListener('click', () => {
  chrome.storage.local.get({ accounts: [] }, (data) => {
    const blob = new Blob([JSON.stringify(data.accounts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'windsurf-accounts.json';
    a.click();
    URL.revokeObjectURL(url);
    addLog('Created emails downloaded!', 'success');
  });
});

function renderAccounts() {
  chrome.storage.local.get({ accounts: [] }, (data) => {
    if (!data.accounts.length) {
      accountsList.innerHTML = '<p style="text-align:center;color:hsl(var(--muted-foreground));font-size:13px;padding:20px;">No accounts created yet.</p>';
      return;
    }
    accountsList.innerHTML = data.accounts.map((acc, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid hsl(var(--border)/0.5);font-size:12px;">
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
          <a class="show-email" data-email="${acc.email}" style="font-weight:600;color:hsl(var(--info));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;cursor:pointer;" href="#">Show Email</a>
          <span style="font-family:'JetBrains Mono',monospace;color:hsl(var(--muted-foreground));font-size:11px;">${acc.password}</span>
        </div>
        <span style="flex-shrink:0;font-size:10px;color:hsl(var(--muted-foreground)/0.7);">${new Date(acc.createdAt).toLocaleDateString()}</span>
      </div>
    `).reverse().join('');
    accountsList.querySelectorAll('.show-email').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const email = el.getAttribute('data-email');
        el.outerHTML = `<a href="mailto:${email}" style="font-weight:600;color:hsl(var(--info));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-decoration:none;cursor:pointer;">${email}</a>`;
      });
    });
  });
}

viewBtn.addEventListener('click', () => {
  renderAccounts();
  accountsModal.style.display = 'block';
});

closeModal.addEventListener('click', () => {
  accountsModal.style.display = 'none';
});

const footerEmail = document.getElementById('footerEmail');
if (footerEmail) {
  footerEmail.addEventListener('click', (e) => {
    e.preventDefault();
    footerEmail.outerHTML = '<span style="color:hsl(var(--muted-foreground)/0.6);">kabanagst@gmail.com</span>';
  });
}

updateStats();
checkSession();
