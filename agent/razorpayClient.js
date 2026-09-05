const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create a payment link for recovery
async function createPaymentLink(amount, customerName, customerEmail, customerPhone, description) {
  try {
    const paymentLink = await razorpay.paymentLink.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      description: description,
      customer: {
        name: customerName,
        email: customerEmail,
        contact: customerPhone,
      },
      notify: {
        sms: true,
        email: true,
      },
      reminder_enable: true,
      notes: {
        recovery_attempt: 'true',
        generated_by: 'RecoverAI',
      },
    });
    return { success: true, link: paymentLink.short_url, id: paymentLink.id };
  } catch (err) {
    const errMsg = err?.error?.description || err?.message || JSON.stringify(err);
    console.error('Error creating payment link:', errMsg);
    return { success: false, error: errMsg };
  }
}

// Fetch recent payments (simulated for test mode)
async function fetchPayments(count = 20) {
  try {
    const payments = await razorpay.payments.all({ count });
    return payments.items || [];
  } catch (err) {
    console.error('Error fetching payments:', err.message);
    return [];
  }
}

// Fetch orders
async function fetchOrders(count = 20) {
  try {
    const orders = await razorpay.orders.all({ count });
    return orders.items || [];
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    return [];
  }
}

module.exports = { createPaymentLink, fetchPayments, fetchOrders, razorpay };
