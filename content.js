// ==================== HELPERS ====================

function setNativeValue(el, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeInputValueSetter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickElement(el) {
  el.focus();
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function toggleCheckbox(checkbox) {
  // Method 1: Click the label (most reliable for React)
  const label = document.querySelector(`label[for="${checkbox.id}"]`);
  if (label) {
    label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    console.log('[WindsurfVIP] Checkbox toggled via label click');
    return;
  }

  // Method 2: Use native checked setter + full event sequence
  const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'checked'
  ).set;
  nativeCheckedSetter.call(checkbox, true);
  checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  checkbox.dispatchEvent(new Event('input', { bubbles: true }));
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('[WindsurfVIP] Checkbox toggled via native setter');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== FORM FILLERS ====================

async function fillForm1(data) {
  // First name
  const firstNameInput = document.querySelector('input[autocomplete="given-name"]');
  if (firstNameInput) {
    setNativeValue(firstNameInput, data.firstName);
    console.log('[WindsurfVIP] First name filled');
  }

  await sleep(500);

  // Last name
  const lastNameInput = document.querySelector('input[autocomplete="family-name"]');
  if (lastNameInput) {
    setNativeValue(lastNameInput, data.lastName);
    console.log('[WindsurfVIP] Last name filled');
  }

  await sleep(500);

  // Email
  const emailInput = document.querySelector('input[type="email"][name="email"]');
  if (emailInput) {
    setNativeValue(emailInput, data.email);
    console.log('[WindsurfVIP] Email filled');
  }

  await sleep(500);

  // Agree checkbox
  const agreeCheckbox = document.querySelector('input#auth1-agree-tos');
  if (agreeCheckbox && !agreeCheckbox.checked) {
    toggleCheckbox(agreeCheckbox);
  } else if (agreeCheckbox) {
    console.log('[WindsurfVIP] Agree checkbox already checked');
  } else {
    // Fallback: try any checkbox in the form
    const checkboxes = document.querySelectorAll('form input[type="checkbox"]');
    for (const cb of checkboxes) {
      if (!cb.checked) {
        toggleCheckbox(cb);
        break;
      }
    }
  }

  await sleep(300);
}

async function fillForm2(data) {
  // Password
  const passwordInput = document.querySelector('input[name="password"][autocomplete="new-password"]');
  if (passwordInput) {
    setNativeValue(passwordInput, data.password);
    console.log('[WindsurfVIP] Password filled');
  }

  await sleep(500);

  // Confirm password
  const confirmInput = document.querySelector('input[name="confirmPassword"][autocomplete="new-password"]');
  if (confirmInput) {
    setNativeValue(confirmInput, data.password);
    console.log('[WindsurfVIP] Confirm password filled');
  }

  await sleep(300);
}

async function fillVerificationCode(data) {
  const code = String(data.code).trim();
  console.log('[WindsurfVIP] fillVerificationCode called with code:', code);

  // --- Targeted: Windsurf 6-box OTP ---
  const boxes = Array.from(document.querySelectorAll('input[maxlength="1"]'));
  if (boxes.length === 6) {
    console.log('[WindsurfVIP] Found 6 OTP boxes');
    // Sort left-to-right
    boxes.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.left - rb.left || ra.top - rb.top;
    });

    for (let i = 0; i < 6; i++) {
      const box = boxes[i];
      const digit = code[i] || '';
      if (!digit) break;

      box.focus();
      box.click();
      await sleep(50);

      // Clear existing value
      setNativeValue(box, '');
      await sleep(50);

      // Set new value
      setNativeValue(box, digit);
      await sleep(50);

      // Dispatch keyboard events so React picks it up
      box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: digit, code: 'Digit' + digit, keyCode: 48 + parseInt(digit), which: 48 + parseInt(digit) }));
      box.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: digit, charCode: 48 + parseInt(digit), which: 48 + parseInt(digit) }));
      box.dispatchEvent(new InputEvent('input', { bubbles: true, data: digit, inputType: 'insertText' }));
      box.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: digit, code: 'Digit' + digit, keyCode: 48 + parseInt(digit), which: 48 + parseInt(digit) }));

      await sleep(150);
    }

    console.log('[WindsurfVIP] All 6 OTP digits filled');

    // Try to enable the disabled submit button
    const submitBtn = document.querySelector('button[type="submit"][disabled]');
    if (submitBtn) {
      submitBtn.removeAttribute('disabled');
      console.log('[WindsurfVIP] Removed disabled from submit button');
    }
    return;
  }

  // --- Fallback: single OTP input ---
  const otpInput = document.querySelector(
    'input[name*="code"], input[name*="otp"], input[name*="verification"], input[placeholder*="code" i], input[aria-label*="code" i]'
  );
  if (otpInput) {
    setNativeValue(otpInput, code);
    otpInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: code.slice(-1) }));
    otpInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: code.slice(-1) }));
    console.log('[WindsurfVIP] Code filled into single OTP input');
    return;
  }

  // --- Fallback: multi-digit (other counts) ---
  const digitInputs = Array.from(document.querySelectorAll('input[maxlength="1"]'));
  if (digitInputs.length >= 4) {
    digitInputs.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.left - rb.left || ra.top - rb.top;
    });
    for (let i = 0; i < Math.min(code.length, digitInputs.length); i++) {
      digitInputs[i].focus();
      setNativeValue(digitInputs[i], code[i]);
      digitInputs[i].dispatchEvent(new InputEvent('input', { bubbles: true }));
      await sleep(100);
    }
    console.log('[WindsurfVIP] Code filled into multi-digit inputs');
    return;
  }

  // --- Fallback: any visible text input near "code" text ---
  const allTextInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"]'));
  for (const input of allTextInputs) {
    if (input.offsetParent !== null && !input.value && !input.readOnly) {
      const parent = input.closest('div, form, section');
      if (parent && /code|verification|verify|otp/i.test(parent.textContent)) {
        setNativeValue(input, code);
        console.log('[WindsurfVIP] Code filled (nearby-text fallback)');
        return;
      }
    }
  }

  console.warn('[WindsurfVIP] Could not find verification code input');
}

function findButtonByText(keywords, exclude = []) {
  const allButtons = document.querySelectorAll('button, a[role="button"]');
  for (const btn of allButtons) {
    if (btn.offsetParent === null) continue;
    const text = btn.textContent.toLowerCase().trim();
    const hasKeyword = keywords.some(k => text.includes(k.toLowerCase()));
    const hasExclude = exclude.some(e => text.includes(e.toLowerCase()));
    if (hasKeyword && !hasExclude) return btn;
  }
  return null;
}

function submitForm(context = '') {
  const pageText = document.body.innerText.toLowerCase();
  const isVerifyPage = /verify|verification|check your|inbox|code|otp/i.test(pageText);

  // Strategy 1: Look for button[type="submit"] first (most reliable)
  const allSubmits = document.querySelectorAll('button[type="submit"]');
  for (const btn of allSubmits) {
    if (btn.offsetParent !== null) {
      // If disabled, try to enable it first
      if (btn.disabled) {
        btn.disabled = false;
        btn.removeAttribute('disabled');
        console.log('[WindsurfVIP] Enabled disabled submit button');
      }
      clickElement(btn);
      console.log('[WindsurfVIP] Clicked button[type="submit"]:', btn.textContent.trim().substring(0, 30));
      return;
    }
  }

  // Strategy 2: On verification pages, "Create account" IS the correct button
  if (isVerifyPage || context === 'verify') {
    const verifyBtn = findButtonByText(['create account', 'verify', 'confirm', 'continue', 'submit', 'next']);
    if (verifyBtn) {
      if (verifyBtn.disabled) {
        verifyBtn.disabled = false;
        verifyBtn.removeAttribute('disabled');
      }
      clickElement(verifyBtn);
      console.log('[WindsurfVIP] Clicked verify page button:', verifyBtn.textContent.trim().substring(0, 30));
      return;
    }
  }

  // Strategy 3: Standard form submit
  const form = document.querySelector('form');
  if (form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.offsetParent !== null) {
      clickElement(submitBtn);
      console.log('[WindsurfVIP] Form submitted via submit button');
      return;
    }
  }

  // Strategy 4: Text-based fallback
  const priorityKeywords = ['continue', 'next', 'verify', 'confirm', 'submit', 'create account'];
  for (const kw of priorityKeywords) {
    const btn = findButtonByText([kw]);
    if (btn) {
      clickElement(btn);
      console.log('[WindsurfVIP] Form submitted via text match:', kw);
      return;
    }
  }

  // Last resort: any visible button in form
  if (form) {
    const buttons = form.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.offsetParent !== null) {
        clickElement(btn);
        console.log('[WindsurfVIP] Form submitted via form button (last resort)');
        return;
      }
    }
  }

  console.warn('[WindsurfVIP] Could not find submit button');
}

// ==================== PRICING & CHECKOUT ====================

function clickStartFreeTrial() {
  const btn = findButtonByText(['start free trial', 'free trial', 'start trial']);
  if (btn) {
    clickElement(btn);
    console.log('[WindsurfVIP] Clicked Start Free Trial');
    return { found: true };
  }
  console.warn('[WindsurfVIP] Start Free Trial button not found');
  return { found: false };
}

function clickCloudflareContinue() {
  // Look for the Cloudflare captcha dialog Continue button
  const dialog = document.querySelector('[id*="headlessui-dialog"], [role="dialog"]');
  if (dialog) {
    const text = dialog.innerText || '';
    if (/captcha|cloudflare|complete the captcha|verify you are human/i.test(text)) {
      const btn = dialog.querySelector('button');
      // Find Continue button specifically
      const buttons = dialog.querySelectorAll('button');
      for (const b of buttons) {
        if (/continue/i.test(b.textContent)) {
          clickElement(b);
          console.log('[WindsurfVIP] Clicked Cloudflare Continue');
          return { clicked: true };
        }
      }
      // Fallback: click the first button if it's the only one
      if (buttons.length === 1) {
        clickElement(buttons[0]);
        console.log('[WindsurfVIP] Clicked Cloudflare button (single)');
        return { clicked: true };
      }
    }
  }

  // Also check for any visible dialog with captcha text
  const pageText = document.body.innerText || '';
  if (/please complete the captcha/i.test(pageText)) {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (/continue/i.test(b.textContent) && b.offsetParent !== null) {
        clickElement(b);
        console.log('[WindsurfVIP] Clicked Continue on captcha page');
        return { clicked: true };
      }
    }
  }

  console.log('[WindsurfVIP] No Cloudflare popup detected');
  return { clicked: false };
}

async function fillStripePayment(data) {
  let filledCount = 0;
  const hostname = location.hostname;

  if (!hostname.includes('stripe.com')) {
    console.warn('[WindsurfVIP] Not on Stripe checkout page');
    return { filled: false };
  }

  // Try to find card fields - they may be in iframes
  // For Stripe hosted checkout, try various selectors
  const cardNumber = document.querySelector('input[name="cardnumber"], input[autocomplete="cc-number"], input[data-elements-stable-field-name="cardNumber"]');
  if (cardNumber) {
    setNativeValue(cardNumber, data.cardNumber);
    filledCount++;
    console.log('[WindsurfVIP] Card number filled');
  }

  await sleep(200);

  const expiry = document.querySelector('input[name="exp-date"], input[autocomplete="cc-exp"], input[data-elements-stable-field-name="cardExpiry"]');
  if (expiry) {
    setNativeValue(expiry, data.expiry);
    filledCount++;
    console.log('[WindsurfVIP] Expiry filled');
  }

  await sleep(200);

  const cvc = document.querySelector('input[name="cvc"], input[autocomplete="cc-csc"], input[data-elements-stable-field-name="cardCvc"]');
  if (cvc) {
    setNativeValue(cvc, data.cvc);
    filledCount++;
    console.log('[WindsurfVIP] CVC filled');
  }

  await sleep(200);

  // Cardholder name
  const nameInput = document.querySelector('input[name="name"], input[autocomplete="cc-name"], input[placeholder*="name" i]');
  if (nameInput) {
    setNativeValue(nameInput, data.name);
    filledCount++;
    console.log('[WindsurfVIP] Name filled');
  }

  await sleep(200);

  // Address line 1
  const addressInput = document.querySelector('input[name="addressLine1"], input[autocomplete="address-line1"], input[placeholder*="address" i]');
  if (addressInput) {
    setNativeValue(addressInput, data.address);
    filledCount++;
    console.log('[WindsurfVIP] Address filled');
  }

  await sleep(200);

  // City
  const cityInput = document.querySelector('input[name="addressCity"], input[autocomplete="address-level2"], input[placeholder*="city" i]');
  if (cityInput) {
    setNativeValue(cityInput, data.city);
    filledCount++;
    console.log('[WindsurfVIP] City filled');
  }

  if (filledCount === 0) {
    console.warn('[WindsurfVIP] No payment fields found. Stripe Elements iframes may require manual entry.');
  }

  return { filled: filledCount > 0, count: filledCount };
}

function checkTermsAndSubmit() {
  const hostname = location.hostname;
  if (!hostname.includes('stripe.com')) {
    console.warn('[WindsurfVIP] Not on Stripe checkout page');
    return { ok: false };
  }

  // Check terms checkbox
  const termsCheckbox = document.querySelector('input#termsOfServiceConsentCheckbox, input[name="termsOfServiceConsentCheckbox"]');
  if (termsCheckbox && !termsCheckbox.checked) {
    toggleCheckbox(termsCheckbox);
    console.log('[WindsurfVIP] Terms checkbox checked');
  }

  // Verify total due today is $0.00
  const totalDueEl = document.querySelector('#OrderDetails-TrialAmount, [data-testid="order-details-trial-total"]');
  let totalDue = '';
  if (totalDueEl) {
    totalDue = totalDueEl.textContent.trim();
    console.log('[WindsurfVIP] Total due today:', totalDue);
  } else {
    // Fallback: search text on page
    const pageText = document.body.innerText;
    const match = pageText.match(/Total due today\s*\$?([\d.,]+)/i);
    if (match) {
      totalDue = '$' + match[1];
      console.log('[WindsurfVIP] Total due today (text):', totalDue);
    }
  }

  // Click Start trial button
  const submitBtn = document.querySelector('button[data-testid="hosted-payment-submit-button"], button[type="submit"]');
  if (submitBtn && submitBtn.offsetParent !== null) {
    // Remove disabled if present
    if (submitBtn.disabled) {
      submitBtn.disabled = false;
      submitBtn.removeAttribute('disabled');
    }
    clickElement(submitBtn);
    console.log('[WindsurfVIP] Clicked Start trial');
    return { ok: true, totalDue: totalDue };
  }

  // Fallback: find by text
  const trialBtn = findButtonByText(['start trial', 'start your trial', 'submit']);
  if (trialBtn) {
    clickElement(trialBtn);
    console.log('[WindsurfVIP] Clicked Start trial (text match)');
    return { ok: true, totalDue: totalDue };
  }

  console.warn('[WindsurfVIP] Start trial button not found');
  return { ok: false, totalDue: totalDue };
}

function clickLogout() {
  // Look for logout button with specific classes
  const logoutBtn = document.querySelector('.body3.cursor-pointer.rounded-sm.px-4.py-2.font-medium.text-sk-black\\/60');
  if (logoutBtn && /log out/i.test(logoutBtn.textContent)) {
    clickElement(logoutBtn);
    console.log('[WindsurfVIP] Clicked logout button');
    return { clicked: true };
  }

  // Fallback: look for any element containing "Log out" text
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    if (el.offsetParent !== null && /log out/i.test(el.textContent) && el.textContent.trim() === 'Log out') {
      clickElement(el);
      console.log('[WindsurfVIP] Clicked logout (fallback)');
      return { clicked: true };
    }
  }

  console.warn('[WindsurfVIP] Logout button not found');
  return { clicked: false };
}

// ==================== MESSAGE LISTENER ====================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      let result;
      switch (msg.action) {
        case 'fillForm1':
          await fillForm1(msg.data);
          sendResponse({ ok: true });
          break;
        case 'fillForm2':
          await fillForm2(msg.data);
          sendResponse({ ok: true });
          break;
        case 'fillVerificationCode':
          await fillVerificationCode(msg.data);
          sendResponse({ ok: true });
          break;
        case 'submitForm':
          submitForm();
          sendResponse({ ok: true });
          break;
        case 'clickStartFreeTrial':
          result = clickStartFreeTrial();
          sendResponse(result);
          break;
        case 'clickCloudflareContinue':
          result = clickCloudflareContinue();
          sendResponse(result);
          break;
        case 'fillStripePayment':
          result = await fillStripePayment(msg.data);
          sendResponse(result);
          break;
        case 'checkTermsAndSubmit':
          result = checkTermsAndSubmit();
          sendResponse(result);
          break;
        case 'clickLogout':
          result = clickLogout();
          sendResponse(result);
          break;
        default:
          sendResponse({ ok: false, error: 'Unknown action' });
      }
    } catch (err) {
      console.error('[WindsurfVIP]', err);
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep channel open for async response
});
