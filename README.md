# ⚡ RecoverAI — AI-Powered Payment Recovery Agent

> **Razorpay × Gemini AI | Track 03 — AI Revenue Recovery**
> Built by **Deepanshu Chauhan** · IIIT Kota · 4th Year CSE

---

## 🧠 What is RecoverAI?

RecoverAI is a fully autonomous AI agent that plugs into Razorpay and automatically recovers revenue lost to failed payments and abandoned carts.

When a payment fails, Razorpay fires a webhook to our server. Gemini AI instantly analyzes the failure — the error code, bank, payment method, transaction amount, and the customer's past history — and executes the smartest possible recovery action in under 15 seconds. No human involvement needed.

---

## 🚀 5 Recovery Modules

| Module | Trigger | What it does |
|--------|---------|-------------|
| 💳 **EMI / Payment Link** | Card declined, insufficient funds | Sends personalized Hinglish SMS + real Razorpay payment link |
| 💬 **Hinglish Nudge** | Cart abandoned | Warm conversational SMS + WhatsApp deep link |
| 🤝 **Promise-to-Pay Tracker** | Repeat late payer detected | Grants extension, logs commitment in tracker |
| 🔄 **Mandate Sequencer** | Subscription auto-debit failed | Silently queues smart retry at off-peak hours — no customer SMS |
| 🚨 **Degradation Detector** | 3+ failures from same bank/method in 60 min | Raises merchant alert, recommends traffic rerouting — zero customer spam |

---

## 🛠️ Tech Stack

- **Backend:** Node.js + Express
- **AI:** Google Gemini 3.6 Flash (`@google/generative-ai`)
- **Payments:** Razorpay (Webhooks + Payment Links API)
- **SMS:** Fast2SMS
- **Frontend:** Vanilla HTML + CSS + JavaScript

---

## 📁 Project Structure

```
razorpay/
├── server.js                  # Express server + webhook routing
├── agent/
│   ├── recoveryAgent.js       # Core AI recovery logic
│   ├── razorpayClient.js      # Razorpay payment link creation
│   ├── smsService.js          # Fast2SMS integration
│   ├── degradationDetector.js # Bank outage pattern detection
│   └── promiseTracker.js      # Promise-to-pay tracking
├── routes/
│   ├── webhook.js             # Razorpay webhook + simulate endpoint
│   └── dashboard.js           # Dashboard API routes
├── public/
│   ├── index.html             # Merchant dashboard UI
│   ├── app.js                 # Frontend logic
│   ├── style.css              # Dashboard styles
│   ├── basic-flow.html        # Core flow diagram
│   └── architecture.html      # Architecture diagram
└── .env.example               # Environment variables template
```

---

## ⚙️ Setup & Installation

### 1. Clone the repo
```bash
git clone https://github.com/deepanshu160105/razorpay_demo.git
cd razorpay_demo
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root:
```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret
GEMINI_API_KEY=your_gemini_api_key
FAST2SMS_API_KEY=your_fast2sms_key
WEBHOOK_SECRET=your_webhook_secret
DEMO_PHONE=9999999999
PORT=3000
```

| Variable | Where to get it |
|----------|----------------|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | [Razorpay Dashboard](https://dashboard.razorpay.com) → Settings → API Keys |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `FAST2SMS_API_KEY` | [Fast2SMS](https://www.fast2sms.com) → Dev API |

### 4. Run the server
```bash
node server.js
```

Open **http://localhost:3000** in your browser.

---

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhook/razorpay` | Real Razorpay webhook (with signature verification) |
| `POST` | `/webhook/simulate` | Manually trigger any payment scenario |
| `GET` | `/api/stats` | Dashboard stats |
| `GET` | `/api/events` | All recovery events |
| `GET` | `/api/degradations` | Active bank degradation alerts |
| `GET` | `/api/promises` | Promise-to-pay tracker |
| `GET` | `/api/health` | System health + API key status |

---

## 🎮 Demo Scenarios

The dashboard includes a **Simulate** panel to trigger each recovery scenario live:

| Button | Scenario | AI Action |
|--------|----------|-----------|
| 💳 Payment Failed | HDFC card ₹14,999 — insufficient funds | Offers EMI |
| 🛒 Cart Abandoned | ₹32,000 cart left unpaid | Hinglish WhatsApp nudge |
| 🤝 Late Payer | Repeat customer with delay history | Promise-to-Pay extension |
| 🔄 Mandate Retry | SBI auto-debit rejected | Silent off-peak retry |
| 🚨 Trigger Degradation | 3 rapid UPI failures | Bank outage alert |

> In production, all of these are triggered automatically by real Razorpay webhook events.

---

## 🔒 Webhook Security

Real Razorpay webhooks are verified using HMAC-SHA256 signature:

```js
const expectedSig = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(req.body) // raw body required
  .digest('hex');
```

The `/webhook/razorpay` route uses `express.raw()` middleware to preserve the raw body before JSON parsing.

---

## 📊 How Degradation Detection Works

The detector tracks payment failures grouped by `bank_method` key.
- Every failure is timestamped and stored in an in-memory sliding window
- Entries older than **60 minutes** are pruned on each new event
- When the count reaches **3 failures** from the same bank+method → alert raised
- Alert includes root cause inference, failure count, and AI recommendation
- Merchant clicks **Mark Resolved** when the bank recovers

---

## 🤝 Promise-to-Pay Tracker

When AI detects a repeat late payer or B2B invoice, it logs a payment commitment:
- `PENDING` → customer has been given an extension
- `KEPT` → merchant marks as paid
- `BROKEN` → automatically flagged when deadline passes
- `REMINDED` → follow-up message sent

---

*Built for the Razorpay Buildathon 2026 · Track 03 — AI Revenue Recovery*
