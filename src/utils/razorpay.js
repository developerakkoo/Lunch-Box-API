const Razorpay = require('razorpay');
const crypto = require('crypto');

function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return null;
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

async function createOrder(amount, currency = 'INR', receipt = undefined) {
  const instance = getRazorpayInstance();
  if (!instance) {
    throw new Error('Razorpay is not configured (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)');
  }
  const options = {
    amount: Math.round(amount),
    currency,
    receipt: receipt || `rcpt_${Date.now()}`,
  };
  return instance.orders.create(options);
}

function verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
  const digest = hmac.digest('hex');
  return digest === razorpay_signature;
}

module.exports = { createOrder, verifySignature };
