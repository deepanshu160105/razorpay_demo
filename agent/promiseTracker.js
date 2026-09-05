// =========================================
//   RecoverAI — Promise-to-Pay Tracker
//   Tracks customer payment commitments
// =========================================

const promises = []; // { id, caseId, phone, email, amount, promisedDate, status, followUps }

function addPromise({ caseId, phone, email, amount, promisedDate, customerMessage }) {
  const id = `PTP_${Date.now()}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  const entry = {
    id,
    caseId,
    phone:          phone || 'N/A',
    email:          email || 'N/A',
    amount,
    promisedDate:   new Date(promisedDate).toISOString(),
    customerMessage,
    status:         'PENDING',   // PENDING | KEPT | BROKEN | REMINDED
    createdAt:      new Date().toISOString(),
    followUps:      [],
    daysLeft:       getDaysLeft(promisedDate),
  };
  promises.unshift(entry);
  console.log(`📅 Promise-to-pay recorded: ${id} — ₹${amount/100} by ${promisedDate}`);
  return entry;
}

function getDaysLeft(date) {
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function markKept(id) {
  const p = promises.find(x => x.id === id);
  if (p) { p.status = 'KEPT'; p.keptAt = new Date().toISOString(); }
  return p;
}

function markBroken(id) {
  const p = promises.find(x => x.id === id);
  if (p) { p.status = 'BROKEN'; p.brokenAt = new Date().toISOString(); }
  return p;
}

function addFollowUp(id, message) {
  const p = promises.find(x => x.id === id);
  if (p) {
    p.status = 'REMINDED';
    p.followUps.push({ time: new Date().toISOString(), message });
  }
  return p;
}

function checkOverdue() {
  const now = Date.now();
  promises.forEach(p => {
    if (p.status === 'PENDING' && new Date(p.promisedDate).getTime() < now) {
      p.status = 'BROKEN';
      p.brokenAt = new Date().toISOString();
      console.log(`⚠️  Promise broken: ${p.id} — customer did not pay by ${p.promisedDate}`);
    }
    p.daysLeft = getDaysLeft(p.promisedDate);
  });
}

function getPromises() {
  checkOverdue();
  return promises;
}

function getPromiseStats() {
  checkOverdue();
  return {
    total:    promises.length,
    pending:  promises.filter(p => p.status === 'PENDING').length,
    kept:     promises.filter(p => p.status === 'KEPT').length,
    broken:   promises.filter(p => p.status === 'BROKEN').length,
    reminded: promises.filter(p => p.status === 'REMINDED').length,
  };
}

module.exports = { addPromise, markKept, markBroken, addFollowUp, getPromises, getPromiseStats };
