require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const dashboardRoutes = require('./routes/dashboard');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Raw body ONLY for the real Razorpay webhook (for signature verification)
app.post('/webhook/razorpay', express.raw({ type: 'application/json' }), require('./routes/webhook').razorpayHandler);

// JSON body for simulate and all API routes
app.use(express.json());
app.use('/webhook', webhookRoutes);
app.use('/api', dashboardRoutes);

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 RecoverAI Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🎯 Webhook endpoint: http://localhost:${PORT}/webhook/razorpay\n`);
});
