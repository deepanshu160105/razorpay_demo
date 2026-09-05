const express = require('express');
const { getRecoveryEvents, getStats } = require('../agent/recoveryAgent');
const { getDegradationAlerts, resolveDegradation } = require('../agent/degradationDetector');
const { getPromises, getPromiseStats, markKept, markBroken, addFollowUp } = require('../agent/promiseTracker');

const router = express.Router();

router.get('/events',       (req, res) => res.json({ success: true, events: getRecoveryEvents() }));
router.get('/stats',        (req, res) => res.json({ success: true, stats: getStats() }));
router.get('/degradations', (req, res) => res.json({ success: true, alerts: getDegradationAlerts() }));
router.get('/promises',     (req, res) => res.json({ success: true, promises: getPromises(), stats: getPromiseStats() }));

router.post('/promises/:id/kept',    (req, res) => res.json({ success: true, promise: markKept(req.params.id) }));
router.post('/promises/:id/broken',  (req, res) => res.json({ success: true, promise: markBroken(req.params.id) }));
router.post('/promises/:id/followup',(req, res) => res.json({ success: true, promise: addFollowUp(req.params.id, req.body.message) }));
router.post('/degradations/:id/resolve', (req, res) => { resolveDegradation(req.params.id); res.json({ success: true }); });

router.get('/health', (req, res) => res.json({
  status: 'online', service: 'RecoverAI', version: '3.0',
  timestamp: new Date().toISOString(),
  features: ['payment-recovery','degradation-detection','b2b-chase','mandate-retry','promise-to-pay','hinglish-sms','whatsapp'],
  keys: {
    razorpay: process.env.RAZORPAY_KEY_ID   ? '✅' : '❌',
    gemini:   process.env.GEMINI_API_KEY    ? '✅' : '❌',
    sms:      process.env.FAST2SMS_API_KEY  ? '✅' : '❌',
  },
}));

module.exports = router;
