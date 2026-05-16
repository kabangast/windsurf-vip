// ==================== TEMP MAIL (via PHP proxy) ====================

const PROXY = 'https://asportshd.com/api/chrome-extensions/windsurf-acgen/proxy.php';

async function proxyFetch(params) {
  const url = `${PROXY}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Proxy error (HTTP ${res.status}): ${errBody.substring(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`Proxy error: ${data.error}`);
  if (!data.success) throw new Error(`API error: ${JSON.stringify(data).substring(0, 300)}`);
  return data;
}

async function loadEnv() {
  const env = {};
  try {
    const url = chrome.runtime.getURL('.env');
    const res = await fetch(url);
    const text = await res.text();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      env[trimmed.substring(0, eq)] = trimmed.substring(eq + 1);
    }
  } catch (e) {
    console.error('[WindsurfVIP] Failed to load .env:', e);
  }
  return env;
}

async function createMailAccount() {
  // Step 1: Auth
  const authResult = await proxyFetch({ action: 'auth' });
  const token = authResult.data?.data?.token;
  const imei = authResult.imei_used || authResult.data?.data?.user?.imei;
  if (!token) throw new Error(`Auth failed: no token in response: ${JSON.stringify(authResult).substring(0, 300)}`);

  // Step 2: Get domains — prefer premium, random selection
  const domainsResult = await proxyFetch({ action: 'get_domains', token });
  const allDomains = domainsResult.data?.data?.domains;
  if (!allDomains || !allDomains.length) throw new Error('No domains returned');

  const enabledDomains = allDomains.filter(d => d.enabled);
  if (!enabledDomains.length) throw new Error('No enabled domains available');

  // Prefer premium, then fallback to non-premium
  let pool = enabledDomains.filter(d => d.premium);
  if (!pool.length) {
    pool = enabledDomains.filter(d => !d.premium);
  }

  const domainName = pool[Math.floor(Math.random() * pool.length)].domain;
  log(`Selected domain: ${domainName} (premium: ${pool[0].premium})`);

  // Step 3: Create email
  const username = generateRandomString(10).toLowerCase();
  const createResult = await proxyFetch({ action: 'create_email', token, email: username, domain: domainName });
  const emailData = createResult.data?.data;
  const address = emailData?.email || emailData?.appEmails?.[0]?.email;
  if (!address) throw new Error(`Email creation failed: ${JSON.stringify(createResult).substring(0, 300)}`);

  return { address, imei, token };
}

function extractTextFromHtml(html) {
  if (!html) return '';
  // Simple HTML-to-text extraction
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCodeInText(text) {
  if (!text) return null;
  // 6-digit code
  const m1 = text.match(/\b(\d{6})\b/);
  if (m1) return m1[1];
  // Code: 123456
  const m2 = text.match(/code[:\s]*(\d{4,8})/i);
  if (m2) return m2[1];
  // Any 4-8 digit number near "code" or "verify"
  const m3 = text.match(/(?:code|verify|verification|otp)[:\s#]*(\d{4,8})/i);
  if (m3) return m3[1];
  return null;
}

function findLinkInText(text) {
  if (!text) return null;
  const m1 = text.match(/https?:\/\/[^\s"'<>]+(?:verify|confirm|activate|token|auth)[^\s"'<>]*/i);
  if (m1) return m1[0];
  const m2 = text.match(/https?:\/\/[^\s"'<>]*windsurf[^\s"'<>]*/i);
  if (m2) return m2[0];
  return null;
}

async function pollForVerificationEmail(emailAddress, maxAttempts = 60, interval = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    log(`Polling inbox (${i + 1}/${maxAttempts})...`);
    await sleep(interval);

    try {
      const result = await proxyFetch({ action: 'get_messages', email: emailAddress });
      const messages = result.data;
      const msgArray = Array.isArray(messages) ? messages : (messages?.data || []);

      if (msgArray && msgArray.length > 0) {
        const msg = msgArray[0];
        log(`Email received! Subject: "${msg.subject || 'none'}"`, 'success');

        // Debug: log available message keys
        log(`Message keys: ${Object.keys(msg).join(', ')}`, 'info');

        // Try all possible body field names
        let rawBody = msg.body || msg.text || msg.html || msg.content || msg.message || msg.data || '';
        // Some APIs nest the body deeper
        if (!rawBody && msg.payload) rawBody = msg.payload.body || msg.payload.html || msg.payload.text || '';
        if (!rawBody && msg.raw) rawBody = msg.raw;

        let textBody = extractTextFromHtml(rawBody);
        let subject = msg.subject || '';

        // Log raw body length for debugging
        log(`Raw body length: ${rawBody.length}, Text body length: ${textBody.length}`, 'info');
        if (rawBody) {
          log(`Raw body preview: ${rawBody.substring(0, 200)}`, 'info');
        }

        let combined = textBody + ' ' + subject;

        // If completely empty, retry
        if (!textBody.trim() && !subject.trim() && !rawBody.trim()) {
          log('Email completely empty, will retry...');
          continue;
        }

        // Try to find code in subject + text + raw body
        const code = findCodeInText(combined) || findCodeInText(rawBody) || findCodeInText(subject);
        if (code) {
          log(`Code found: ${code}`, 'success');
          return { type: 'code', value: code };
        }

        // Try to find link in raw HTML before stripping, then in text
        const link = findLinkInText(rawBody) || findLinkInText(textBody);
        if (link) {
          log(`Link found: ${link}`, 'success');
          return { type: 'link', value: link };
        }

        // If body is empty but we have a subject, retry a few times for body to populate
        if (!textBody.trim() && subject.trim() && i < maxAttempts - 1) {
          log('Body empty, retrying for full content...');
          continue;
        }

        log(`No code/link in email. Subject: "${subject}" Body preview: "${textBody.substring(0, 200)}"`, 'info');
        return { type: 'raw', value: textBody || subject || rawBody };
      }
    } catch (e) {
      log(`Poll error: ${e.message}`, 'error');
    }
  }
  throw new Error('Timeout waiting for verification email');
}

// ==================== HELPERS ====================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateFirstName() {
  const names = [
    'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
    'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
    'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
    'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle'
  ];
  return names[Math.floor(Math.random() * names.length)];
}

function generateLastName() {
  const names = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
    'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'
  ];
  return names[Math.floor(Math.random() * names.length)];
}

function generatePassword() {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%&*';

  let password = '';
  password += upper.charAt(Math.floor(Math.random() * upper.length));
  password += lower.charAt(Math.floor(Math.random() * lower.length));
  password += digits.charAt(Math.floor(Math.random() * digits.length));
  password += special.charAt(Math.floor(Math.random() * special.length));

  const all = lower + upper + digits + special;
  for (let i = 0; i < 8; i++) {
    password += all.charAt(Math.floor(Math.random() * all.length));
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// ==================== SAVE ACCOUNT ====================

async function saveAccount(email, password) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ accounts: [] }, (data) => {
      data.accounts.push({
        email,
        password,
        createdAt: new Date().toISOString()
      });
      chrome.storage.local.set({ accounts: data.accounts }, resolve);
    });
  });
}

// ==================== BROADCAST LOG ====================

function log(text, level = 'info') {
  console.log(`[WindsurfVIP] ${text}`);
  chrome.runtime.sendMessage({ type: 'log', text, level }).catch(() => {});
}

function setStatus(text) {
  chrome.runtime.sendMessage({ type: 'status', text }).catch(() => {});
}

// ==================== SEND MSG TO TAB ====================

async function sendToTab(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      if (i < maxRetries - 1) {
        log(`Tab message failed, retrying (${i + 1}/${maxRetries})...`);
        await sleep(2000);
      } else {
        throw err;
      }
    }
  }
}

async function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    // Check if already complete
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve();
        return;
      }
      if (tab && tab.status === 'complete') {
        resolve();
        return;
      }
      // Otherwise wait for status change
      function listener(id, changeInfo) {
        if (id === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function waitForTabUrl(tabId, urlPattern, maxWait = 120000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Tab closed'));
          return;
        }
        if (tab.url && tab.url.includes(urlPattern)) {
          resolve(tab.url);
          return;
        }
        if (Date.now() - start > maxWait) {
          reject(new Error(`Timeout waiting for URL: ${urlPattern}`));
          return;
        }
        setTimeout(check, 2000);
      });
    }
    check();
  });
}

// ==================== SESSION PERSISTENCE ====================

async function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ session: null }, (data) => resolve(data.session));
  });
}

async function saveSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ session }, resolve);
  });
}

async function clearSession() {
  return new Promise((resolve) => {
    chrome.storage.local.remove('session', resolve);
  });
}

async function reLoginMail(imei) {
  const authResult = await proxyFetch({ action: 'auth', imei });
  return authResult.data.data.token;
}

// ==================== MAIN FLOW ====================

let shouldStop = false;
let isRunning = false;

function checkStop() {
  if (shouldStop) {
    shouldStop = false;
    isRunning = false;
    throw new Error('Stopped by user');
  }
}

const STEPS = [
  'create_mail',
  'generate_data',
  'check_logout',
  'open_register',
  'fill_form1',
  'submit_form1',
  'fill_form2',
  'submit_form2',
  'wait_verification',
  'enter_code',
  'wait_profile',
  'save_account',
  'go_pricing',
  'click_free_trial',
  'wait_cloudflare',
  'wait_stripe',
  'fill_payment',
  'confirm_trial',
  'wait_otp'
];

async function startRegistration(forceNew = false) {
  isRunning = true;
  let session = null;

  if (!forceNew) {
    session = await getSession();
  }

  if (session) {
    log(`Resuming from step: ${session.step}`, 'info');
    log(`Using existing email: ${session.mailAddress}`, 'info');
  } else {
    session = { step: 'create_mail', tabId: null };
  }

  try {
    checkStop();
    // ---- STEP: create_mail ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('create_mail')) {
      setStatus('Creating email');
      log('Creating temporary email...');
      const mail = await createMailAccount();
      if (!mail.address) throw new Error('Email creation returned empty address');
      session.mailAddress = mail.address;
      session.mailImei = mail.imei;
      session.mailToken = mail.token;
      session.step = 'generate_data';
      await saveSession(session);
      log(`Email created: ${mail.address}`, 'success');
    }

    // Validate we have an email before proceeding
    if (!session.mailAddress) throw new Error('No email address in session. Start a new registration.');

    checkStop();
    // ---- STEP: generate_data ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('generate_data')) {
      if (!session.firstName) {
        session.firstName = generateFirstName();
        session.lastName = generateLastName();
        session.accountPassword = generatePassword();
        await saveSession(session);
      }
      log(`Name: ${session.firstName} ${session.lastName}`);
      log(`Password: ${session.accountPassword}`);
      session.step = 'check_logout';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: check_logout ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('check_logout')) {
      setStatus('Checking login status');
      log('Checking if user is logged in...');

      // Check if we have an existing tab or need to create one
      let tabId = session.tabId;
      let tabValid = false;

      if (tabId) {
        try {
          const tab = await chrome.tabs.get(tabId);
          tabValid = true;
          log(`Existing tab found: ${tab.url}`);
        } catch (e) {
          tabValid = false;
        }
      }

      if (!tabValid) {
        log('No valid tab, creating new tab...');
        const tab = await chrome.tabs.create({ url: 'https://windsurf.com/profile', active: true });
        tabId = tab.id;
        session.tabId = tabId;
        await saveSession(session);
        await waitForTabLoad(tabId);
        await sleep(3000);
      }

      // Check if on profile page (logged in)
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && tab.url.includes('/profile')) {
        log('User is logged in on profile page. Logging out...');
        await sendToTab(tabId, { action: 'clickLogout' });
        await sleep(3000);

        // Wait for redirect to login page
        log('Waiting for redirect to login page...');
        await waitForTabUrl(tabId, '/account/login', 30000);
        log('Redirected to login page!', 'success');
      } else {
        log('User is not logged in, proceeding to registration...');
      }

      session.step = 'open_register';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: open_register ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('open_register')) {
      setStatus('Opening register');
      log('Opening registration page...');

      // Reuse existing tab if available, otherwise create new
      let tab;
      if (session.tabId) {
        try {
          tab = await chrome.tabs.get(session.tabId);
          await chrome.tabs.update(session.tabId, { url: 'https://windsurf.com/account/register', active: true });
        } catch (e) {
          tab = await chrome.tabs.create({ url: 'https://windsurf.com/account/register', active: true });
          session.tabId = tab.id;
        }
      } else {
        tab = await chrome.tabs.create({ url: 'https://windsurf.com/account/register', active: true });
        session.tabId = tab.id;
      }

      session.step = 'fill_form1';
      await saveSession(session);
      await waitForTabLoad(session.tabId);
      await sleep(3000);
    }

    // Ensure we have a valid tab
    let tabValid = false;
    if (session.tabId) {
      try {
        await chrome.tabs.get(session.tabId);
        tabValid = true;
      } catch (e) {
        tabValid = false;
      }
    }
    if (!tabValid) {
      log('Tab not found, reopening...', 'info');
      const tab = await chrome.tabs.create({ url: 'https://windsurf.com/account/register', active: true });
      session.tabId = tab.id;
      await saveSession(session);
      await waitForTabLoad(session.tabId);
      await sleep(3000);
    }

    checkStop();
    // ---- STEP: fill_form1 ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('fill_form1')) {
      setStatus('Filling form 1');
      log('Filling registration form...');
      await sendToTab(session.tabId, {
        action: 'fillForm1',
        data: { firstName: session.firstName, lastName: session.lastName, email: session.mailAddress }
      });
      await sleep(2000);
      session.step = 'submit_form1';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: submit_form1 ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('submit_form1')) {
      log('Submitting form 1...');
      await sendToTab(session.tabId, { action: 'submitForm' });
      await sleep(5000);
      session.step = 'fill_form2';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: fill_form2 ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('fill_form2')) {
      setStatus('Filling password');
      log('Waiting for password form...');
      await sleep(3000);

      log('Filling password form...');
      await sendToTab(session.tabId, {
        action: 'fillForm2',
        data: { password: session.accountPassword }
      });
      await sleep(2000);
      session.step = 'submit_form2';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: submit_form2 ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('submit_form2')) {
      log('Submitting password form...');
      await sendToTab(session.tabId, { action: 'submitForm' });
      log('Waiting 7s for SPA navigation to verification page...');
      await sleep(7000);
      session.step = 'wait_verification';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: wait_verification ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('wait_verification')) {
      setStatus('Waiting for email');
      log(`Checking temp mail for verification email at: ${session.mailAddress}`);

      const verification = await pollForVerificationEmail(session.mailAddress);
      session.verificationType = verification.type;
      session.verificationValue = verification.value;

      if (verification.type === 'code') {
        log(`Verification CODE found: ${verification.value}`, 'success');
      } else if (verification.type === 'link') {
        log(`Verification LINK found: ${verification.value}`, 'success');
      } else {
        log(`Raw email body received (no code/link detected)`, 'info');
      }

      session.step = 'enter_code';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: enter_code ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('enter_code')) {
      if (session.verificationType === 'code') {
        log(`Verification code is: ${session.verificationValue}`, 'success');
        chrome.runtime.sendMessage({ type: 'code', code: session.verificationValue }).catch(() => {});

        log('Entering verification code...');
        setStatus('Entering code');
        await sleep(2000);

        await sendToTab(session.tabId, {
          action: 'fillVerificationCode',
          data: { code: session.verificationValue }
        });
        await sleep(2000);

        log('Clicking submit...');
        await sendToTab(session.tabId, { action: 'submitForm', context: 'verify' });
        await sleep(3000);

        session.step = 'wait_profile';
        await saveSession(session);

      } else if (session.verificationType === 'link') {
        log(`Opening verification link...`);
        setStatus('Verifying link');
        await chrome.tabs.update(session.tabId, { url: session.verificationValue });
        await waitForTabLoad(session.tabId);
        await sleep(5000);

        session.step = 'wait_profile';
        await saveSession(session);

      } else {
        log('No code or link found in email. Check logs above for email body.', 'error');
        throw new Error('Verification failed: no code or link found in email');
      }
    }

    checkStop();
    // ---- STEP: wait_profile ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('wait_profile')) {
      setStatus('Waiting redirect');
      log('Waiting for redirect to profile...');
      await waitForTabUrl(session.tabId, '/profile', 120000);
      log('Redirected to profile!', 'success');
      session.step = 'save_account';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: save_account ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('save_account')) {
      setStatus('Saving');
      await saveAccount(session.mailAddress, session.accountPassword);
      log(`Account saved: ${session.mailAddress}`, 'success');
      session.step = 'go_pricing';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: go_pricing ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('go_pricing')) {
      setStatus('Going to pricing');
      log('Navigating to pricing page...');
      await chrome.tabs.update(session.tabId, { url: 'https://windsurf.com/pricing' });
      await sleep(2000);
      session.step = 'click_free_trial';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: click_free_trial ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('click_free_trial')) {
      setStatus('Clicking free trial');
      log('Looking for Start Free Trial button...');
      let clicked = false;
      for (let i = 0; i < 10; i++) {
        try {
          const result = await sendToTab(session.tabId, { action: 'clickStartFreeTrial' });
          if (result && result.found) {
            log('Start Free Trial clicked!', 'success');
            clicked = true;
            break;
          }
        } catch (e) {
          log(`Button not ready yet (${i + 1}/10), retrying...`);
        }
        await sleep(1000);
      }
      if (!clicked) {
        log('No Start Free Trial button found after 10 retries. Stopping.', 'warn');
        throw new Error('Start Free Trial button not found on pricing page');
      }
      await sleep(3000);
      session.step = 'wait_cloudflare';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: wait_cloudflare ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('wait_cloudflare')) {
      setStatus('Waiting for Cloudflare');
      log('Waiting for Cloudflare captcha popup...');
      await sleep(5000);
      try {
        const result = await sendToTab(session.tabId, { action: 'clickCloudflareContinue' });
        if (result && result.clicked) {
          log('Cloudflare Continue clicked!', 'success');
        } else {
          log('No Cloudflare popup found, proceeding...', 'info');
        }
      } catch (e) {
        log('Cloudflare step error: ' + e.message, 'warn');
      }
      await sleep(3000);
      session.step = 'wait_stripe';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: wait_stripe ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('wait_stripe')) {
      setStatus('Waiting for Stripe checkout');
      log('Waiting for Stripe checkout page...');
      await waitForTabUrl(session.tabId, 'checkout.stripe.com', 120000);
      log('Stripe checkout loaded!', 'success');
      await sleep(3000);
      session.step = 'fill_payment';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: fill_payment ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('fill_payment')) {
      setStatus('Filling payment');
      log('Filling payment details...');
      const env = await loadEnv();
      if (!env.CARD_NUMBER || !env.CARD_EXPIRY || !env.CARD_CVC) {
        throw new Error('Missing card details in .env file (CARD_NUMBER, CARD_EXPIRY, CARD_CVC)');
      }
      const paymentData = {
        cardNumber: env.CARD_NUMBER,
        expiry: env.CARD_EXPIRY,
        cvc: env.CARD_CVC,
        name: env.CARD_NAME === 'random' ? `${session.firstName} ${session.lastName}` : env.CARD_NAME,
        address: env.ADDRESS === 'random' ? `${session.firstName} Street ${Math.floor(Math.random() * 900) + 100}` : env.ADDRESS,
        city: env.CITY === 'random' ? 'New York' : env.CITY
      };
      try {
        const result = await sendToTab(session.tabId, { action: 'fillStripePayment', data: paymentData });
        if (result && result.filled) {
          log('Payment details filled!', 'success');
        } else {
          log('Could not fill all payment fields (iframes may require manual input)', 'warn');
        }
      } catch (e) {
        log('Payment fill error: ' + e.message, 'warn');
      }
      await sleep(2000);
      session.step = 'confirm_trial';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: confirm_trial ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('confirm_trial')) {
      setStatus('Confirming trial');
      log('Checking terms and clicking Start trial...');
      try {
        const result = await sendToTab(session.tabId, { action: 'checkTermsAndSubmit' });
        if (result && result.ok) {
          log(`Trial submitted! Total due: ${result.totalDue || 'unknown'}`, 'success');
          if (result.totalDue && !result.totalDue.includes('$0.00')) {
            log('WARNING: Total due today is not $0.00!', 'warn');
          }
        } else {
          log('Could not complete trial submission', 'warn');
        }
      } catch (e) {
        log('Trial submission error: ' + e.message, 'warn');
      }
      await sleep(3000);
      session.step = 'wait_otp';
      await saveSession(session);
    }

    checkStop();
    // ---- STEP: wait_otp ----
    if (STEPS.indexOf(session.step) <= STEPS.indexOf('wait_otp')) {
      setStatus('Waiting for OTP');
      log('Waiting for bank OTP popup (please enter manually)...');
      chrome.runtime.sendMessage({ type: 'status', text: 'Enter OTP manually' }).catch(() => {});
      // Wait indefinitely for user to manually enter OTP
      await sleep(60000);
      log('OTP wait complete. Checking result...');
    }

    // Done — clear session
    await clearSession();
    isRunning = false;
    chrome.runtime.sendMessage({ type: 'done' }).catch(() => {});

  } catch (err) {
    isRunning = false;
    log(`Error at step [${session.step}]: ${err.message}`, 'error');
    await saveSession(session);
    log('Session saved. Click "Resume" to retry from this step.', 'info');
    chrome.runtime.sendMessage({ type: 'error', text: err.message }).catch(() => {});
  }
}

// ==================== LISTENER ====================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startRegistration') {
    startRegistration(false);
    sendResponse({ ok: true });
  }
  if (msg.action === 'newRegistration') {
    startRegistration(true);
    sendResponse({ ok: true });
  }
  if (msg.action === 'clearSession') {
    clearSession().then(() => {
      log('Session cleared', 'success');
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.action === 'getSession') {
    getSession().then((session) => {
      sendResponse({ session, isRunning });
    });
    return true;
  }
  if (msg.action === 'stopRegistration') {
    shouldStop = true;
    sendResponse({ ok: true });
  }
});
