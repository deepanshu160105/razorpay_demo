// =========================================
//   RecoverAI v2.0 — Frontend App
// =========================================

let allEvents = [];
let caseCounter = 1019;

// Pre-seeded stats (looks impressive on load)
const BASE = { failed: 47, abandoned: 23, recovered: 18, revenue: 284700, sms: 15, links: 18, highRisk: 4 };

// ---- Simulate Scenarios ----
const SCENARIOS = {
  failed: {
    event: 'payment.failed',
    paymentData: { amount: 1499900, currency: 'INR', status: 'failed', method: 'card',
      email: 'rahul.sharma@gmail.com', contact: '+916395862556',
      error_code: 'BAD_REQUEST_ERROR', error_description: 'Your card has insufficient funds.', bank: 'HDFC' }
  },
  abandoned: {
    event: 'checkout.abandoned',
    paymentData: { amount: 3200000, currency: 'INR', status: 'abandoned', method: null,
      email: 'priya.mehta@yahoo.in', contact: '+916395862556',
      error_code: 'CHECKOUT_ABANDONED', error_description: 'Customer left checkout without completing payment.' }
  },
  sub_failed: {
    event: 'subscription.charged.failed',
    paymentData: { amount: 49900, currency: 'INR', status: 'failed', method: 'emandate',
      email: 'amit.patel@company.in', contact: '+916395862556',
      error_code: 'BAD_REQUEST_ERROR', error_description: 'Mandate not active. Bank rejected auto-debit.', bank: 'SBI' }
  },
  promise: {
    event: 'payment.failed',
    paymentData: { amount: 250000, currency: 'INR', status: 'failed', method: 'card',
      email: 'lateset@gmail.com', contact: '+916395862556',
      error_code: 'BAD_REQUEST_ERROR', error_description: 'Card limit exceeded.', bank: 'HDFC' }
  },
  success: {
    event: 'payment.captured',
    paymentData: { amount: 89900, currency: 'INR', status: 'captured', method: 'upi',
      email: 'customer@gmail.com', contact: '+916395862556', vpa: 'customer@paytm' }
  }
};

// ---- Toast ----
function showToast(type, icon, title, sub, ms = 4500) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-icon">${icon}</div><div><div class="toast-title">${title}</div><div class="toast-sub">${sub}</div></div>`;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---- AI Thinking (5 steps) ----
let thinkTimer = null;
const STEPS = ['as1','as2','as3','as4','as5'];
const SUBS  = [
  'Event received from Razorpay...',
  'Checking customer history...',
  'Gemini AI analyzing failure...',
  'Deciding recovery action...',
  'Sending SMS & creating payment link...',
];

function showThinking() {
  const box = document.getElementById('ai-thinking');
  box.classList.add('active');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  STEPS.forEach(s => document.getElementById(s).className = 'ai-step');
  document.getElementById('as1').classList.add('active');
  document.getElementById('ai-sub').textContent = SUBS[0];
  let i = 0;
  thinkTimer = setInterval(() => {
    if (i > 0 && i - 1 < STEPS.length) document.getElementById(STEPS[i-1]).classList.replace('active','done');
    i++;
    if (i < STEPS.length) {
      document.getElementById(STEPS[i]).classList.add('active');
      document.getElementById('ai-sub').textContent = SUBS[i];
    }
    if (i >= STEPS.length - 1) clearInterval(thinkTimer);
  }, 2000);
}

function hideThinking() {
  clearInterval(thinkTimer);
  STEPS.forEach(s => document.getElementById(s).classList.add('done'));
  setTimeout(() => {
    document.getElementById('ai-thinking').classList.remove('active');
    STEPS.forEach(s => document.getElementById(s).className = 'ai-step');
  }, 1200);
}

// ---- Simulate ----
async function simulate(event, key) {
  const btn = document.getElementById(`sim-${key}`);
  btn.classList.add('loading');
  const scenario = JSON.parse(JSON.stringify(SCENARIOS[key]));
  scenario.paymentData.payment_id = 'pay_' + Math.random().toString(36).substr(2,14).toUpperCase();
  scenario.paymentData.order_id   = 'order_' + Math.random().toString(36).substr(2,14).toUpperCase();

  showToast('info','📡','Event Detected',`${fmtType(event)} — AI is analyzing now`);
  showThinking();

  try {
    const res  = await fetch('/webhook/simulate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(scenario) });
    const data = await res.json();
    hideThinking();
    if (data.success && data.event) {
      caseCounter++;
      data.event._caseNum = caseCounter;
      allEvents.unshift(data.event);
      bumpCounters(data.event);
      renderFeed();

      const action = data.event.aiDecision?.recoveryAction;
      const conf   = data.event.aiDecision?.confidence || 0;
      const sms    = data.event.recoveryResult?.smsSent;

      if (action === 'OFFER_EMI')         showToast('success','💳',`AI: Offer EMI (${conf}% confident)`,`EMI link created${sms?' + SMS sent 📱':''}!`);
      else if (action === 'SEND_PAYMENT_LINK') showToast('success','🤖',`AI: Send Payment Link (${conf}%)`,`Recovery link created${sms?' + SMS sent 📱':''}!`);
      else if (action === 'HINGLISH_SMS_RETRY') showToast('success','💬',`AI: Hinglish SMS Retry (${conf}%)`,`Warm message sent in Hinglish${sms?' 📱':''}!`);
      else if (action === 'B2B_CHASE') showToast('success','🏢',`AI: B2B Chase (${conf}%)`,`Invoice recovery + Promise-to-Pay logged!`);
      else if (action === 'MANDATE_RETRY_SEQUENCE') showToast('info','🔄',`AI: Mandate Retry (${conf}%)`,`Retry scheduled in ${data.event.recoveryResult?.retryAfterHours || 10} hours!`);
      else if (action === 'PROMISE_TO_PAY') showToast('success','🤝',`AI: Promise to Pay (${conf}%)`,`Customer promise logged and tracked!`);
      else if (action === 'DEGRADATION_ALERT' || action === 'SEND_ALERT')    showToast('warning','⚠️',`AI: Alert Triggered`,`Risk: ${data.event.aiDecision?.riskLevel}`);
      else                                 showToast('info','✅','Payment Logged','No recovery needed');

      if (data.event.recoveryResult?.paymentLink) {
        setTimeout(() => showSmsPopup(data.event), 1500);
      }
      
      // Update feeds for degradation/promise
      if (typeof fetchFeeds === 'function') fetchFeeds();
    }
  } catch(e) {
    hideThinking();
    showToast('error','❌','Error','Could not simulate: ' + e.message);
  } finally {
    setTimeout(() => btn.classList.remove('loading'), 2500);
  }
}

// ---- Stats ----
function bumpCounters(ev) {
  if (ev.type === 'payment.failed') BASE.failed++;
  else if (ev.type === 'checkout.abandoned') BASE.abandoned++;
  const action = ev.aiDecision?.recoveryAction;
  if (ev.recoveryResult?.executed && action !== 'NO_ACTION') {
    BASE.recovered++;
    BASE.revenue += (ev.paymentData?.amount || 0);
  }
  if (ev.recoveryResult?.smsSent) BASE.sms++;
  if (ev.recoveryResult?.paymentLink) BASE.links++;
  if (ev.aiDecision?.riskLevel === 'HIGH') BASE.highRisk++;
  renderStats();
}

function renderStats() {
  const total = BASE.recovered + BASE.failed;
  const rate  = total > 0 ? Math.round((BASE.recovered / total) * 100) : 0;

  setVal('s-failed',    BASE.failed);
  setVal('s-abandoned', BASE.abandoned);
  setVal('s-recovered', BASE.recovered);
  setRev('s-revenue',   BASE.revenue);
  setVal('s-sms',       BASE.sms);
  setVal('s-links',     BASE.links);
  setVal('s-highrisk',  BASE.highRisk);
  document.getElementById('s-rate').textContent       = rate + '%';
  document.getElementById('s-rate-badge').textContent = '↑ ' + rate + '% rate';
}

function setVal(id, v) { document.getElementById(id).textContent = v; }
function setRev(id, paise) {
  const amt = paise / 100;
  document.getElementById(id).textContent =
    amt >= 100000 ? '₹' + (amt/100000).toFixed(1) + 'L' :
    amt >= 1000   ? '₹' + (amt/1000).toFixed(1) + 'K'  :
                    '₹' + amt.toFixed(0);
}

// ---- SMS Popup ----
function showSmsPopup(ev) {
  const contact = ev.paymentData?.contact || '+91 XXXXX XXXXX';
  const amount  = ev.paymentData?.amount ? '₹'+(ev.paymentData.amount/100).toLocaleString('en-IN') : '₹---';
  const link    = ev.recoveryResult?.paymentLink || '';
  const waLink  = ev.recoveryResult?.whatsappLink || `https://wa.me/${contact.replace(/\+/g,'')}`;
  const msg     = ev.aiDecision?.customerMessage || `Aapka ${amount} payment fail hua. Retry karein!`;

  document.getElementById('sms-contact').textContent  = contact;
  document.getElementById('sms-bubble').textContent   = msg;
  document.getElementById('sms-link-url').textContent = link || 'rzp.io/...';
  document.getElementById('sms-wa-link').href = waLink;
  document.getElementById('sms-overlay').classList.add('open');
}
function closeSmsPopup() { document.getElementById('sms-overlay').classList.remove('open'); }

// ---- Render Feed ----
function renderFeed() {
  const feed = document.getElementById('events-feed');
  if (!allEvents.length) {
    feed.innerHTML = `<div class="empty-state"><div class="empty-icon">🤖</div>
      <div class="empty-title">RecoverAI is watching your payments...</div>
      <div class="empty-sub">Simulate an event above or connect real Razorpay webhooks to see AI recovery in action</div></div>`;
    return;
  }
  feed.innerHTML = allEvents.map((ev, i) => card(ev, i)).join('');
}

function card(ev, i) {
  const risk    = ev.aiDecision?.riskLevel || 'LOW';
  const action  = ev.aiDecision?.recoveryAction || '—';
  const reason  = ev.aiDecision?.failureReason || 'Analyzing...';
  const conf    = ev.aiDecision?.confidence || 0;
  const method  = ev.aiDecision?.suggestedMethod;
  const link    = ev.recoveryResult?.paymentLink;
  const waLink  = ev.recoveryResult?.whatsappLink;
  const sms     = ev.recoveryResult?.smsSent;
  const amount  = ev.paymentData?.amount ? '₹'+(ev.paymentData.amount/100).toLocaleString('en-IN') : '';
  const time    = new Date(ev.timestamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const caseNum = ev._caseNum || (1020+i);
  const isRecov = ev.recoveryResult?.executed && action !== 'NO_ACTION';

  const statusBadge = isRecov
    ? `<span class="badge badge-recovered">✅ RECOVERED</span>`
    : action === 'NO_ACTION' ? `<span class="badge badge-pending">✓ LOGGED</span>`
    : ev.status === 'error'  ? `<span class="badge badge-failed">⚠ ERROR</span>`
    : `<span class="badge badge-pending">⏳ PENDING</span>`;

  return `<div class="event-card risk-${risk}" onclick="openModal(${i})">
    <div class="event-top">
      <div class="event-title-wrap">
        <span class="event-case-num">#${caseNum}</span>
        <span style="font-size:18px">${icon(ev.type)}</span>
        <span class="event-type-label">${fmtType(ev.type)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        ${amount?`<span class="event-amount">${amount}</span>`:''}
        <span class="event-time">${time}</span>
      </div>
    </div>
    <div class="event-mid">
      <span class="badge badge-risk-${risk}">⚡ ${risk} RISK</span>
      <span class="badge badge-action">🤖 ${fmtAction(action)}</span>
      ${method?`<span class="badge" style="background:rgba(77,159,255,0.1);color:var(--blue)">💡 ${method.toUpperCase()}</span>`:''}
      ${sms?`<span class="badge" style="background:rgba(0,229,160,0.1);color:var(--green)">📱 SMS Sent</span>`:''}
      ${statusBadge}
    </div>
    <div class="event-reason">${reason}</div>
    <div class="event-bottom">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${link?`<a class="event-link" href="${link}" target="_blank" onclick="event.stopPropagation()">🔗 Payment Link</a>`:''}
        ${waLink?`<a class="event-link" href="${waLink}" target="_blank" onclick="event.stopPropagation()" style="color:#25d366;background:rgba(37,211,102,0.1)">📲 WhatsApp</a>`:''}
        ${link?`<button class="sms-preview-btn" onclick="event.stopPropagation();showSmsForIdx(${i})">💬 SMS Preview</button>`:''}
      </div>
      <div class="event-confidence">
        <span>AI</span>
        <div class="confidence-bar-wrap"><div class="confidence-bar" style="width:${conf}%"></div></div>
        <span>${conf}%</span>
      </div>
    </div>
  </div>`;
}

function showSmsForIdx(i) { showSmsPopup(allEvents[i]); }
function icon(t) { return {'payment.failed':'💳','checkout.abandoned':'🛒','subscription.charged.failed':'🔄','payment.captured':'🎉'}[t]||'📨'; }
function fmtType(t) { return t.split('.').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '); }
function fmtAction(a) { 
  return {
    'SEND_PAYMENT_LINK':'Send Payment Link',
    'OFFER_EMI':'Offer EMI',
    'HINGLISH_SMS_RETRY':'Hinglish SMS Retry',
    'SEND_ALERT':'Send Alert',
    'B2B_CHASE': 'B2B Invoice Chase',
    'MANDATE_RETRY_SEQUENCE': 'Mandate Retry',
    'PROMISE_TO_PAY': 'Promise Tracker',
    'DEGRADATION_ALERT': 'Degradation Alert',
    'NO_ACTION':'No Action'
  }[a]||a; 
}

// ---- Modal ----
function openModal(i) {
  const ev = allEvents[i]; if(!ev) return;
  const pd = ev.paymentData||{}, ai = ev.aiDecision||{}, rr = ev.recoveryResult||{};
  const riskColor = {'HIGH':'var(--red)','MEDIUM':'var(--gold)','LOW':'var(--green)'}[ai.riskLevel]||'var(--text)';

  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">${icon(ev.type)} ${fmtType(ev.type)}</div>
    <div class="modal-sub">#${ev._caseNum||'—'} · ${ev.id} · ${new Date(ev.timestamp).toLocaleString('en-IN')}</div>
    <div class="modal-section">
      <div class="modal-section-title">Payment Details</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-key">Payment ID</div><div class="detail-val">${pd.payment_id||'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Amount</div><div class="detail-val" style="color:var(--gold)">₹${pd.amount?(pd.amount/100).toLocaleString('en-IN'):'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Method</div><div class="detail-val">${pd.method||'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Status</div><div class="detail-val">${pd.status||'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Email</div><div class="detail-val">${pd.email||'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Phone</div><div class="detail-val">${pd.contact||'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Bank</div><div class="detail-val">${pd.bank||'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Error</div><div class="detail-val" style="color:var(--red)">${pd.error_description||'—'}</div></div>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">🤖 Gemini AI Decision</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-key">Risk Level</div><div class="detail-val" style="color:${riskColor}">${ai.riskLevel||'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Action</div><div class="detail-val" style="color:var(--accent2)">${fmtAction(ai.recoveryAction||'—')}</div></div>
        <div class="detail-item"><div class="detail-key">Confidence</div><div class="detail-val">${ai.confidence||0}%</div></div>
        <div class="detail-item"><div class="detail-key">Suggested Method</div><div class="detail-val" style="color:var(--blue)">${ai.suggestedMethod||'—'}</div></div>
        <div class="detail-item"><div class="detail-key">SMS Sent</div><div class="detail-val" style="color:${rr.smsSent?'var(--green)':'var(--text-muted)'}">${rr.smsSent?'✅ Yes':'—'}</div></div>
        <div class="detail-item"><div class="detail-key">Payment Link</div><div class="detail-val" style="color:${rr.paymentLink?'var(--green)':'var(--text-muted)'}">${rr.paymentLink?'✅ Created':'—'}</div></div>
      </div>
      <div class="ai-message-box">
        <b style="color:var(--accent2)">AI Reasoning:</b> ${ai.actionReason||'—'}<br/><br/>
        <b style="color:var(--accent2)">Customer Message (Hinglish):</b><br/>"${ai.customerMessage||'—'}"
      </div>
      ${rr.paymentLink?`<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <a class="event-link" href="${rr.paymentLink}" target="_blank">🔗 Payment Link</a>
        ${rr.whatsappLink?`<a class="event-link" href="${rr.whatsappLink}" target="_blank" style="color:#25d366;background:rgba(37,211,102,0.1)">📲 WhatsApp</a>`:''}
        <button class="sms-preview-btn" onclick="showSmsPopup(allEvents[${i}])">💬 SMS Preview</button>
      </div>`:''}
    </div>
    <div class="modal-section">
      <div class="modal-section-title">📋 Full Audit Trail</div>
      <div class="audit-list">
        ${(ev.auditTrail||[]).map((s,j,arr)=>`
          <div class="audit-item">
            <div class="audit-dot-col"><div class="audit-dot"></div>${j<arr.length-1?'<div class="audit-line"></div>':''}</div>
            <div><div class="audit-step">${s.step}</div><div class="audit-detail">${s.detail}</div><div class="audit-time">${new Date(s.time).toLocaleTimeString('en-IN')}</div></div>
          </div>`).join('')}
      </div>
    </div>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
function clearAll() { allEvents = []; renderFeed(); }

// ---- Run Full Demo ----
let demoRunning = false;
async function runFullDemo() {
  if (demoRunning) return;
  demoRunning = true;
  const btn = document.getElementById('demo-btn');
  btn.disabled = true; btn.innerHTML = '⏳ Running...';
  clearAll();
  showToast('info','🎬','Full Demo Started','Running all 4 recovery scenarios...');
  for (const [event, key] of [['payment.failed','failed'],['checkout.abandoned','abandoned'],['subscription.charged.failed','sub_failed'],['payment.failed','promise']]) {
    await new Promise(r=>setTimeout(r,1000));
    await simulate(event, key);
    await new Promise(r=>setTimeout(r,8000));
  }
  
  await new Promise(r=>setTimeout(r,2000));
  await simulateDegradation();

  btn.disabled = false; btn.innerHTML = '<span>🎬</span> Run Full Demo';
  demoRunning = false;
  showToast('success','🏆','Demo Complete!','All 7 scenarios demonstrated successfully!');
}

// ---- Health & Feeds Init ----
async function ping() {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    document.getElementById('status-dot').classList.add('online');
    document.getElementById('status-text').textContent = 'System Online';
    
    // Also fetch degradations and promises
    fetchFeeds();
  } catch {
    document.getElementById('status-dot').classList.remove('online');
    document.getElementById('status-text').textContent = 'Disconnected';
  }
}

async function fetchFeeds() {
  try {
    const [degRes, promRes] = await Promise.all([
      fetch('/api/degradations'),
      fetch('/api/promises')
    ]);
    const degData = await degRes.json();
    const promData = await promRes.json();
    
    renderDegradations(degData.alerts || []);
    renderPromises(promData.promises || []);
  } catch (err) {
    console.error('Failed to fetch feeds', err);
  }
}

function renderDegradations(alerts) {
  const feed = document.getElementById('degradation-feed');
  const activeAlerts = alerts.filter(a => !a.resolved);
  
  if (activeAlerts.length === 0) {
    feed.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px;">No active degradations. All systems operational.</div>';
    return;
  }
  
  feed.innerHTML = activeAlerts.map(a => `
    <div style="background: rgba(255,77,109,0.1); border-left: 3px solid var(--red); padding: 12px; border-radius: 8px; margin-bottom: 8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; color:var(--red); font-size:14px;">⚠️ ${a.bank} ${a.method} Outage</span>
        <button onclick="resolveDegradation('${a.id}')" style="background:var(--card); border:1px solid var(--card-border); color:var(--text); padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Mark Resolved</button>
      </div>
      <div style="font-size:12px; color:var(--text-dim); margin-top:4px;">${a.failureCount} failures detected. ${a.rootCause}</div>
      <div style="font-size:12px; color:var(--accent2); margin-top:4px;">💡 AI: ${a.recommendation}</div>
    </div>
  `).join('');
}

async function resolveDegradation(id) {
  await fetch(`/api/degradations/${id}/resolve`, { method: 'POST' });
  fetchFeeds();
}

function renderPromises(promises) {
  const feed = document.getElementById('promise-feed');
  
  if (promises.length === 0) {
    feed.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px;">No active promises to track.</div>';
    return;
  }
  
  feed.innerHTML = promises.map(p => {
    const statusColor = {'PENDING':'var(--gold)', 'KEPT':'var(--green)', 'BROKEN':'var(--red)', 'REMINDED':'var(--blue)'}[p.status] || 'var(--text)';
    return `
    <div style="background: var(--card); border: 1px solid var(--card-border); padding: 12px; border-radius: 8px; margin-bottom: 8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; font-size:13px;">${p.phone}</span>
        <span style="font-size:11px; font-weight:700; background:rgba(255,255,255,0.05); padding:2px 8px; border-radius:12px; color:${statusColor}">${p.status}</span>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Promised: ₹${(p.amount/100).toLocaleString('en-IN')} by ${new Date(p.promisedDate).toLocaleDateString('en-IN')}</div>
      ${p.status === 'PENDING' ? `
      <div style="display:flex; gap:6px; margin-top:8px;">
        <button onclick="updatePromise('${p.id}', 'kept')" style="flex:1; background:rgba(0,229,160,0.1); border:1px solid rgba(0,229,160,0.2); color:var(--green); padding:4px; border-radius:4px; font-size:11px; cursor:pointer;">✅ Kept</button>
        <button onclick="updatePromise('${p.id}', 'broken')" style="flex:1; background:rgba(255,77,109,0.1); border:1px solid rgba(255,77,109,0.2); color:var(--red); padding:4px; border-radius:4px; font-size:11px; cursor:pointer;">❌ Broken</button>
      </div>` : ''}
    </div>
  `}).join('');
}

async function updatePromise(id, action) {
  await fetch(`/api/promises/${id}/${action}`, { method: 'POST' });
  fetchFeeds();
}

async function simulateDegradation() {
  const btn = document.getElementById('sim-degradation');
  btn.classList.add('loading');
  showToast('info','🚨','Triggering Degradation','Simulating 3 rapid UPI failures...');
  
  for(let i=0; i<3; i++) {
    const scenario = {
      event: 'payment.failed',
      paymentData: { amount: 150000, currency: 'INR', status: 'failed', method: 'upi',
        email: `victim${i}@gmail.com`, contact: '+916395862556', bank: 'NPCI',
        error_code: 'GATEWAY_ERROR', error_description: 'UPI Timeout', payment_id: 'pay_DEG'+Math.random().toString(36).substr(2,6).toUpperCase() }
    };
    await fetch('/webhook/simulate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(scenario) });
  }
  
  btn.classList.remove('loading');
  showToast('warning','🚨','Degradation Detected','Check the detector panel!');
  fetchFeeds();
  // Fetch latest events
  const res = await fetch('/api/events');
  const data = await res.json();
  allEvents = data.events;
  renderFeed();
}

renderStats();
ping();
setInterval(ping, 4000);

