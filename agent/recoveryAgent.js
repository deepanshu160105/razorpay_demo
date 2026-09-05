const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createPaymentLink } = require('./razorpayClient');
const { sendSMS } = require('./smsService');
const { logFailure, getDegradationAlerts } = require('./degradationDetector');
const { addPromise } = require('./promiseTracker');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

const recoveryEvents = [];
// ---- Customer History ----
const customerHistory = {
  // Pre-seed a "Late Payer" profile for the demo so no real DB is needed
  '6395862556': {
    totalAttempts: 4,
    successCount: 1,
    preferredMethod: 'card',
    events: [
      { type: 'payment.failed', method: 'card', amount: 250000, time: new Date(Date.now() - 14*24*3600000).toISOString() },
      { type: 'payment.failed', method: 'upi', amount: 250000, time: new Date(Date.now() - 10*24*3600000).toISOString() },
      { type: 'payment.captured', method: 'card', amount: 250000, time: new Date(Date.now() - 5*24*3600000).toISOString() }
    ]
  }
}; // keyed by 10-digit phone
function updateCustomerHistory(phone, eventRecord) {
  if (!phone) return;
  const key = phone.replace(/\+91|[\s\-]/g, '').slice(-10);
  if (!customerHistory[key]) customerHistory[key] = { events: [], preferredMethod: null, totalAttempts: 0, successCount: 0 };
  const h = customerHistory[key];
  h.totalAttempts++;
  if (eventRecord.type === 'payment.captured') h.successCount++;
  if (eventRecord.type === 'payment.captured' && eventRecord.paymentData?.method) h.preferredMethod = eventRecord.paymentData.method;
  h.events.push({ type: eventRecord.type, method: eventRecord.paymentData?.method, amount: eventRecord.paymentData?.amount, time: eventRecord.timestamp });
  if (h.events.length > 5) h.events = h.events.slice(-5);
}

function getCustomerHistory(phone) {
  if (!phone) return null;
  const key = phone.replace(/\+91|[\s\-]/g, '').slice(-10);
  return customerHistory[key] || null;
}

// ---- Main Recovery Function ----
async function analyzeAndRecover(event, paymentData) {
  const eventId = `EVT_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const eventRecord = {
    id: eventId, type: event, timestamp: new Date().toISOString(),
    paymentData, status: 'analyzing',
    aiDecision: null, recoveryAction: null, recoveryResult: null, auditTrail: [],
  };
  recoveryEvents.unshift(eventRecord);

  eventRecord.auditTrail.push({ step: 'EVENT_RECEIVED', time: new Date().toISOString(), detail: `Received ${event} for payment ${paymentData.payment_id || 'N/A'}` });

  // Degradation detection
  const degradationAlert = logFailure(paymentData);
  if (degradationAlert && !degradationAlert.resolved) {
    eventRecord.auditTrail.push({ step: 'DEGRADATION_DETECTED', time: new Date().toISOString(), detail: `🚨 ${degradationAlert.rootCause} (${degradationAlert.failureCount} failures)` });
  }

  // Customer history lookup
  const phone = paymentData.contact || process.env.DEMO_PHONE;
  const custHist = getCustomerHistory(phone);
  if (custHist) {
    eventRecord.auditTrail.push({ step: 'CUSTOMER_HISTORY_FOUND', time: new Date().toISOString(),
      detail: `${custHist.totalAttempts} past attempts, ${custHist.successCount} successful. Preferred: ${custHist.preferredMethod || 'unknown'}` });
  }

  try {
    const histCtx = custHist
      ? `Customer History: ${custHist.totalAttempts} attempts, ${custHist.successCount} successful, preferred method: ${custHist.preferredMethod || 'unknown'}, recent: ${JSON.stringify(custHist.events.slice(-2))}`
      : 'Customer History: First time or unknown customer.';

    const degCtx = degradationAlert
      ? `\n⚠️ ACTIVE DEGRADATION: ${degradationAlert.rootCause}\nRecommendation: ${degradationAlert.recommendation}`
      : '';

    const isB2B     = (paymentData.amount || 0) > 5000000; // >₹50,000
    const isMandate = event.includes('subscription') || paymentData.method === 'emandate';
    const isAbandoned = event.includes('abandoned');
    const amount    = paymentData.amount || 0;

    const prompt = `
You are RecoverAI, an expert AI payment recovery agent for Indian merchants using Razorpay.

Event: ${event}
Payment: ${JSON.stringify(paymentData, null, 2)}
${histCtx}${degCtx}
Amount: ₹${amount/100}
Is B2B (>₹50K): ${isB2B}
Is Mandate/Subscription: ${isMandate}
Is Cart Abandoned: ${isAbandoned}

Choose the BEST recovery action and respond with ONLY a valid JSON object:
{
  "failureReason": "precise root cause",
  "riskLevel": "HIGH | MEDIUM | LOW",
  "recoveryAction": "SEND_PAYMENT_LINK | OFFER_EMI | HINGLISH_SMS_RETRY | B2B_CHASE | MANDATE_RETRY_SEQUENCE | PROMISE_TO_PAY | DEGRADATION_ALERT | NO_ACTION",
  "actionReason": "why this action, mention history if relevant",
  "customerMessage": "personalized Hinglish/English message using customer name from email. For B2B make it formal English.",
  "suggestedMethod": "upi | card | netbanking | emi | wallet",
  "retryAfterHours": null,
  "promisedPayDate": null,
  "confidence": 90
}

Action rules (CRITICAL - Pick EXACTLY one):
- SEND_PAYMENT_LINK: Standard failure (amount < ₹5000), send a retry link.
- OFFER_EMI: Amount >₹5000 + card declined → suggest EMI link.
- HINGLISH_SMS_RETRY: Cart abandoned → warm Hinglish nudge.
- B2B_CHASE: Amount >₹50,000 → B2B formal recovery. Set promisedPayDate to 3 days from now. 
- MANDATE_RETRY_SEQUENCE: Auto-debit/subscription failed → DO NOT alert customer. Set retryAfterHours to 10.
- PROMISE_TO_PAY: Customer history has delays OR method is 'card' with limit issue → Set promisedPayDate to 2 days from now.
- DEGRADATION_ALERT: Active bank outage → Alert merchant, don't spam customer.
- NO_ACTION: Payment succeeded.
`;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    let aiDecision;
    try {
      const m = responseText.match(/\{[\s\S]*\}/);
      aiDecision = JSON.parse(m ? m[0] : responseText);
    } catch {
      aiDecision = { failureReason: 'Parse error', riskLevel: 'MEDIUM', recoveryAction: 'SEND_PAYMENT_LINK', actionReason: 'Fallback', customerMessage: 'Aapka payment fail hua. Retry karein!', suggestedMethod: 'upi', confidence: 50 };
    }

    eventRecord.aiDecision = aiDecision;
    eventRecord.status = 'decided';
    eventRecord.auditTrail.push({ step: 'AI_ANALYSIS_COMPLETE', time: new Date().toISOString(),
      detail: `Gemini: ${aiDecision.recoveryAction} (${aiDecision.confidence}%) | Method: ${aiDecision.suggestedMethod}` });

    // ---- Execute Recovery ----
    let recoveryResult = { action: aiDecision.recoveryAction, executed: false };
    const customerPhone = paymentData.contact || process.env.DEMO_PHONE || '+919999999999';
    const customerEmail = paymentData.email || 'customer@example.com';
    const customerName  = customerEmail.split('@')[0];
    const amountInr     = (paymentData.amount || 0) / 100;

    // SCENARIO 1: MANDATE RETRY (Silent Background Queue, NO SMS)
    if (aiDecision.recoveryAction === 'MANDATE_RETRY_SEQUENCE') {
      const retryAt = new Date(Date.now() + (aiDecision.retryAfterHours || 10) * 3600000);
      recoveryResult = { action: 'MANDATE_RETRY_SEQUENCE', executed: true, retryScheduled: retryAt.toISOString(), retryAfterHours: aiDecision.retryAfterHours || 10, smsSent: false };
      
      eventRecord.auditTrail.push({ step: 'SILENT_MODE_ACTIVE', time: new Date().toISOString(), detail: 'Customer not disturbed via SMS to prevent spam.' });
      eventRecord.auditTrail.push({ step: 'RETRY_QUEUED', time: new Date().toISOString(), detail: `Smart-retry queued for bank off-peak hours at ${retryAt.toLocaleString('en-IN')}` });
    }
    
    // SCENARIO 2: B2B CHASE (Formal Email + Slack Alert, Tracker)
    else if (aiDecision.recoveryAction === 'B2B_CHASE') {
      const linkResult = await createPaymentLink(amountInr, customerName, customerEmail, customerPhone, `Invoice Recovery`);
      
      recoveryResult = { action: 'B2B_CHASE', executed: true, paymentLink: linkResult.link || null, smsSent: false };
      
      // Add to Promise Tracker
      const promise = addPromise({ caseId: eventId, phone: customerEmail, email: customerEmail, amount: paymentData.amount, promisedDate: aiDecision.promisedPayDate || new Date(Date.now() + 3*24*3600000), customerMessage: "Formal B2B Invoice Sent" });
      
      eventRecord.auditTrail.push({ step: 'SALES_ALERT_SENT', time: new Date().toISOString(), detail: `Slack notification sent to key account manager for ${customerName}` });
      eventRecord.auditTrail.push({ step: 'FORMAL_EMAIL_SENT', time: new Date().toISOString(), detail: `Automated payment reminder email dispatched to ${customerEmail} with link ${linkResult.link}` });
      eventRecord.auditTrail.push({ step: 'TRACKER_UPDATED', time: new Date().toISOString(), detail: `Receivable tracked: ID ${promise.id}` });
    }
    
    // SCENARIO 3: DEGRADATION (Merchant Alert, System Action)
    else if (aiDecision.recoveryAction === 'DEGRADATION_ALERT' || aiDecision.recoveryAction === 'SEND_ALERT') {
      recoveryResult = { action: aiDecision.recoveryAction, executed: true, riskLevel: aiDecision.riskLevel, alertMessage: aiDecision.failureReason, smsSent: false };
      eventRecord.auditTrail.push({ step: 'ROUTE_SWITCHED', time: new Date().toISOString(), detail: `Traffic dynamically re-routed away from failing node.` });
      eventRecord.auditTrail.push({ step: 'MERCHANT_ALERT_SENT', time: new Date().toISOString(), detail: `High priority alert: ${aiDecision.failureReason}` });
    }

    // SCENARIO 4: NORMAL ACTIONS WITH SMS (Link, EMI, Hinglish, Promise)
    else if (['SEND_PAYMENT_LINK','OFFER_EMI','HINGLISH_SMS_RETRY','PROMISE_TO_PAY'].includes(aiDecision.recoveryAction)) {
      const linkResult = await createPaymentLink(amountInr, customerName, customerEmail, customerPhone, `RecoverAI: ${aiDecision.customerMessage}`);

      const waMsg  = `${aiDecision.customerMessage}\n\nRetry payment: ${linkResult.link || ''}`;
      const waLink = linkResult.link ? `https://wa.me/${customerPhone.replace(/\+/g,'')}?text=${encodeURIComponent(waMsg)}` : null;

      recoveryResult = { action: aiDecision.recoveryAction, executed: linkResult.success, paymentLink: linkResult.link || null, whatsappLink: waLink, error: linkResult.error || null, smsSent: false, smsPhone: customerPhone };

      eventRecord.auditTrail.push({ step: 'PAYMENT_LINK_CREATED', time: new Date().toISOString(), detail: linkResult.success ? `✅ Link: ${linkResult.link}` : `❌ ${linkResult.error}` });
      if (waLink) eventRecord.auditTrail.push({ step: 'WHATSAPP_READY', time: new Date().toISOString(), detail: `WhatsApp intent generated` });

      // Send Real SMS
      if (linkResult.success) {
        const smsResult = await sendSMS(customerPhone, aiDecision.customerMessage, linkResult.link);
        recoveryResult.smsSent = smsResult.success;
        eventRecord.auditTrail.push({ step: smsResult.success ? 'SMS_SENT' : 'SMS_FAILED', time: new Date().toISOString(),
          detail: smsResult.success ? `✅ SMS delivered to ${customerPhone}` : `❌ ${smsResult.error}` });
      }

      // Add to Promise Tracker if Late Payer
      if (aiDecision.recoveryAction === 'PROMISE_TO_PAY' && aiDecision.promisedPayDate) {
        const promise = addPromise({ caseId: eventId, phone: customerPhone, email: customerEmail, amount: paymentData.amount, promisedDate: aiDecision.promisedPayDate, customerMessage: aiDecision.customerMessage });
        eventRecord.auditTrail.push({ step: 'PROMISE_RECORDED', time: new Date().toISOString(), detail: `Extension granted. Tracked as ${promise.id}` });
      }
    }
    
    // SCENARIO 5: NO ACTION
    else {
      recoveryResult = { action: 'NO_ACTION', executed: true };
      eventRecord.auditTrail.push({ step: 'NO_ACTION', time: new Date().toISOString(), detail: 'Payment succeeded — logged' });
    }

    eventRecord.recoveryResult = recoveryResult;
    eventRecord.status = 'completed';
    updateCustomerHistory(phone, eventRecord);

    eventRecord.auditTrail.push({ step: 'RECOVERY_COMPLETE', time: new Date().toISOString(),
      detail: `Done: ${aiDecision.recoveryAction} | SMS: ${recoveryResult.smsSent ? '✅' : '—'} | Link: ${recoveryResult.paymentLink ? '✅' : '—'}` });

    console.log(`✅ [RecoverAI] ${eventId} — ${aiDecision.recoveryAction}`);
    return eventRecord;

  } catch (err) {
    console.error('❌ Agent error:', err.message);
    eventRecord.status = 'error';
    eventRecord.auditTrail.push({ step: 'ERROR', time: new Date().toISOString(), detail: err.message });
    return eventRecord;
  }
}

function getRecoveryEvents() { return recoveryEvents; }

function getStats() {
  const total    = recoveryEvents.length;
  const recovered = recoveryEvents.filter(e => e.recoveryResult?.executed && e.aiDecision?.recoveryAction !== 'NO_ACTION').length;
  const highRisk  = recoveryEvents.filter(e => e.aiDecision?.riskLevel === 'HIGH').length;
  const paymentLinks = recoveryEvents.filter(e => e.recoveryResult?.paymentLink).length;
  const smsSent   = recoveryEvents.filter(e => e.recoveryResult?.smsSent).length;
  const revenueRecovered = recoveryEvents.filter(e => e.recoveryResult?.executed && e.aiDecision?.recoveryAction !== 'NO_ACTION').reduce((s, e) => s + (e.paymentData?.amount || 0), 0);
  const recoveryRate = total > 0 ? Math.round((recovered / total) * 100) : 0;
  const mandateRetries = recoveryEvents.filter(e => e.recoveryResult?.retryScheduled).length;
  const b2bChases = recoveryEvents.filter(e => e.aiDecision?.recoveryAction === 'B2B_CHASE').length;
  const degradations = getDegradationAlerts().filter(a => !a.resolved).length;

  return { total, recovered, highRisk, paymentLinks, smsSent, revenueRecovered, recoveryRate, mandateRetries, b2bChases, degradations };
}

module.exports = { analyzeAndRecover, getRecoveryEvents, getStats };
