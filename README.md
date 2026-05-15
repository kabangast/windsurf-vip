# Windsurf VIP Auto Register

A Chrome extension that automates Windsurf account creation using temporary email addresses, with optional Stripe free trial signup.

## Features

- **Automated Registration** — Generates random profiles and temp email addresses
- **Email Verification** — Auto-polls inbox, extracts verification codes/links
- **Session Recovery** — Saves progress at each step; resume anytime via popup
- **Free Trial Flow** — Optional automation for pricing page → Stripe checkout
- **Cloudflare Handling** — Detects and clicks through verification prompts
- **Payment Auto-fill** — Fills Stripe checkout form from local `.env` config
- **Total Due Check** — Verifies "$0.00" before confirming trial
- **OTP Pause** — Waits for manual bank OTP entry
- **Export Accounts** — Saves credentials to local storage, exportable as JSON

## Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/kabangast/windsurf-vip.git
cd windsurf-vip
cp .env.example .env
# Edit .env with your card details (never commit this file)
```

### 2. Load Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `windsurf-vip` folder
4. Click the extension icon in the toolbar to start

## Configuration

Create a `.env` file from `.env.example`:

```env
CARD_NUMBER=0000000000000000
CARD_EXPIRY=MM/YY
CARD_CVC=000
CARD_NAME=random      # "random" = auto-generated name
ADDRESS=random        # "random" = auto-generated address
CITY=random           # "random" = default city
```

> **Never commit `.env`.** It is pre-ignored in `.gitignore`.

## How It Works

### Registration Flow

1. Creates temporary email via temp-mail API
2. Generates random first/last name + password
3. Opens `windsurf.com/account/register`
4. Fills & submits registration form
5. Polls inbox for verification email
6. Extracts code/link and completes verification
7. Waits for redirect to `/profile`
8. Saves account credentials

### Free Trial Flow (optional)

9. Navigates to `/pricing`
10. Clicks **Start Free Trial** (retries until found)
11. Handles Cloudflare popup if present
12. Waits for Stripe checkout to load
13. Fills payment details from `.env`
14. Verifies **Total due today = $0.00**
15. Checks terms and clicks **Start trial**
16. Pauses for manual bank OTP entry

### Popup Controls

| Button | Action |
|--------|--------|
| Resume / Start | Continue saved session or start new |
| New | Force new registration (clears session) |
| Clear | Reset session and logs |
| Export Credentials | Download JSON of all saved accounts |

## Session Persistence

Progress is saved in Chrome `storage.local` after each step. If the browser closes or an error occurs:

1. Click the extension icon
2. Click **Resume / Start**
3. Flow continues from the last successful step

## Tech Notes

- **React Compatibility** — Uses native event dispatching (`setNativeValue`) so React synthetic events register input values correctly
- **Stripe Iframes** — Card number/expiry/CVC fields live inside cross-origin iframes (`js.stripe.com`) which content scripts cannot access. The extension fills accessible fields and logs a warning for iframes
- **Temp Mail** — PHP proxy wraps temp-mail.club API; handles auth, domain listing, email creation, and message polling

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Proxy error | Verify proxy URL is reachable and PHP server is running |
| No enabled domains | Temp mail service may be down; retry later |
| Timeout waiting for email | Check popup logs — code may be in the email subject line |
| Start Free Trial not found | Page may still be loading; click Resume to retry |
| Card fields not filled | Stripe iframes are inaccessible — enter manually |
| Total due is not $0.00 | Stop immediately; verify free trial terms |

## License

MIT

## Disclaimer

This extension is for educational purposes. Use responsibly and in accordance with Windsurf's Terms of Service.
