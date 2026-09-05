const express = require('express');
const crypto = require('crypto');
const { analyzeAndRecover } = require('../agent/recoveryAgent');

const router = express.Router();

// Real Razorpay webhook handler (receives raw body for signature verification)
async function razorpayHandler(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.WEBHOOK_SECRET;

    // Verify webhook signature
    if (signature && secret) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.body)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.warn('⚠️  Invalid webhook signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const payload = JSON.parse(req.body.toString());
    const event = payload.event;
    const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity || {};

    console.log(`\n📨 Webhook received: ${event}`);

    // Respond to Razorpay immediately (required within 5 seconds)
    res.status(200).json({ received: true });

    // Process asynchronously
    const paymentData = {
      payment_id: entity.id,
      order_id: entity.order_id,
      amount: entity.amount,
      currency: entity.currency,
      status: entity.status,
      method: entity.method,
      email: entity.email,
      contact: entity.contact,
      error_code: entity.error_code,
      error_description: entity.error_description,
      bank: entity.bank,
      wallet: entity.wallet,
      vpa: entity.vpa,
      created_at: entity.created_at,
    };

    await analyzeAndRecover(event, paymentData);

  } catch (err) {
    console.error('Webhook error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
}

// Manual trigger for testing (hackathon demo!) — receives JSON body
router.post('/simulate', async (req, res) => {
  try {
    const { event, paymentData } = req.body;
    if (!event || !paymentData) {
      return res.status(400).json({ error: 'Missing event or paymentData' });
    }
    console.log(`\n🎮 Simulated event: ${event}`);
    const result = await analyzeAndRecover(event, paymentData);
    res.json({ success: true, event: result });
  } catch (err) {
    console.error('Simulate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.razorpayHandler = razorpayHandler;
