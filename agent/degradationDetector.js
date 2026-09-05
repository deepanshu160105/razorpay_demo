// =========================================
//   RecoverAI — Degradation Detector
//   Detects bank/UPI outages from patterns
// =========================================

// Track failures per bank/method with timestamps
const degradationLog = {}; // { "HDFC_card": [{time, amount, paymentId}] }
const degradationAlerts = []; // active degradation alerts

const WINDOW_MS = 60 * 60 * 1000; // 1 hour window
const THRESHOLD = 3; // 3+ failures = degradation

function logFailure(paymentData) {
  if (!paymentData || paymentData.status === 'captured') return null;

  const bank   = paymentData.bank   || 'UNKNOWN';
  const method = paymentData.method || 'unknown';
  const key    = `${bank}_${method}`;
  const now    = Date.now();

  if (!degradationLog[key]) degradationLog[key] = [];

  // Add this failure
  degradationLog[key].push({
    time:      now,
    amount:    paymentData.amount,
    paymentId: paymentData.payment_id,
    error:     paymentData.error_description,
  });

  // Clean old entries outside window
  degradationLog[key] = degradationLog[key].filter(e => now - e.time < WINDOW_MS);

  const count = degradationLog[key].length;

  // Trigger alert if threshold crossed
  if (count === THRESHOLD) {
    const alert = {
      id:        `DEG_${Date.now()}`,
      timestamp: new Date().toISOString(),
      key,
      bank,
      method,
      failureCount: count,
      rootCause: inferRootCause(bank, method, count),
      recommendation: getRecommendation(bank, method),
      events: [...degradationLog[key]],
      resolved: false,
    };
    degradationAlerts.unshift(alert);
    console.log(`🚨 DEGRADATION DETECTED: ${bank} ${method} — ${count} failures in last hour`);
    return alert;
  }

  // Update existing alert count
  const existing = degradationAlerts.find(a => a.key === key && !a.resolved);
  if (existing) {
    existing.failureCount = count;
    return existing;
  }

  return null;
}

function inferRootCause(bank, method, count) {
  if (method === 'upi') return `UPI gateway experiencing high failure rate. Possible NPCI outage or ${bank} UPI server issue.`;
  if (method === 'card' && bank !== 'UNKNOWN') return `${bank} card authorization server may be down or under maintenance.`;
  if (method === 'emandate') return `NACH/mandate processing delayed. Bank batch processing may be experiencing issues.`;
  return `Multiple ${method} payments failing via ${bank}. Possible gateway or bank-side issue.`;
}

function getRecommendation(bank, method) {
  if (method === 'upi') return 'Switch customers to card or netbanking payment option temporarily.';
  if (method === 'card') return `Suggest customers use UPI or netbanking instead of ${bank} cards.`;
  if (method === 'emandate') return 'Retry mandates after 6 hours. Notify subscribers of delay.';
  return 'Monitor and retry after 30 minutes. Alert merchant immediately.';
}

function getDegradationAlerts()  { return degradationAlerts; }
function resolveDegradation(id)  { const a = degradationAlerts.find(x => x.id === id); if (a) a.resolved = true; }
function getDegradationLog()     { return degradationLog; }

module.exports = { logFailure, getDegradationAlerts, resolveDegradation, getDegradationLog };
