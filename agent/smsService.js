const https = require('https');

/**
 * Send SMS via Fast2SMS
 * @param {string} phone - 10-digit Indian mobile number (without +91)
 * @param {string} message - SMS message text
 * @param {string} paymentLink - optional payment link to append
 */
async function sendSMS(phone, message, paymentLink = null) {
  return new Promise((resolve) => {
    // Clean phone number — remove +91, spaces, dashes
    const cleanPhone = phone.replace(/\+91|[\s\-]/g, '').slice(-10);

    if (!cleanPhone || cleanPhone.length !== 10) {
      console.warn('⚠️  Invalid phone number:', phone);
      return resolve({ success: false, error: 'Invalid phone number' });
    }

    const fullMessage = paymentLink
      ? `${message}\n\nRetry payment here: ${paymentLink}`
      : message;

    const params = new URLSearchParams({
      authorization: process.env.FAST2SMS_API_KEY,
      message: fullMessage,
      language: 'english',
      route: 'dlt',
      numbers: cleanPhone,
      flash: '0',
    });

    const options = {
      hostname: 'www.fast2sms.com',
      path: `/dev/bulkV2?${params.toString()}`,
      method: 'GET',
      headers: {
        'cache-control': 'no-cache',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.return === true) {
            console.log(`✅ SMS sent to +91${cleanPhone}`);
            resolve({ success: true, phone: cleanPhone, response: parsed });
          } else {
            console.error(`❌ SMS failed:`, parsed.message || data);
            resolve({ success: false, error: parsed.message || 'SMS failed', raw: data });
          }
        } catch {
          console.error('❌ SMS parse error:', data);
          resolve({ success: false, error: 'Parse error', raw: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ SMS request error:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.end();
  });
}

module.exports = { sendSMS };
