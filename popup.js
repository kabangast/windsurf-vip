const startBtn = document.getElementById('startBtn');
const newBtn = document.getElementById('newBtn');
const clearBtn = document.getElementById('clearBtn');
const logContainer = document.getElementById('logContainer');
const totalCount = document.getElementById('totalCount');
const statusText = document.getElementById('statusText');
const exportBtn = document.getElementById('exportBtn');
const sessionInfo = document.getElementById('sessionInfo');
const sessionDetail = document.getElementById('sessionDetail');
const codeDisplay = document.getElementById('codeDisplay');
const codeValue = document.getElementById('codeValue');

function addLog(message, type = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
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
      sessionInfo.style.display = 'block';
      sessionDetail.textContent = `Email: ${response.session.mailAddress || 'N/A'} | Step: ${response.session.step}`;
      startBtn.textContent = '▶ Resume';
    } else {
      sessionInfo.style.display = 'none';
      startBtn.textContent = '▶ Start';
    }
  });
}

function disableButtons() {
  startBtn.disabled = true;
  newBtn.disabled = true;
}

function enableButtons() {
  startBtn.disabled = false;
  newBtn.disabled = false;
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
    codeDisplay.style.display = 'block';
    addLog(`Verification code: ${msg.code}`, 'success');
  }
  if (msg.type === 'done') {
    enableButtons();
    statusText.textContent = 'Done';
    codeDisplay.style.display = 'none';
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

newBtn.addEventListener('click', () => {
  disableButtons();
  statusText.textContent = 'Running';
  addLog('Starting NEW registration (fresh session)...', 'info');
  chrome.runtime.sendMessage({ action: 'newRegistration' });
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clearSession' }, () => {
    addLog('Session cleared', 'success');
    checkSession();
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
    addLog('Credentials exported!', 'success');
  });
});

updateStats();
checkSession();
