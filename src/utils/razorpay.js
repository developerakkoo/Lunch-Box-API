const Razorpay = require('razorpay');
const crypto = require('crypto');

const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

async function createOrder(amount, currency = 'INR', receipt = undefined) {
  const options = {
    amount: Math.round(amount), // amount in paise (if already multiplied by 100)
    currency,
    receipt: receipt || `rcpt_${Date.now()}`
  };

  const order = await instance.orders.create(options);
  return order;
}

function verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
  const digest = hmac.digest('hex');
  return digest === razorpay_signature;
}

module.exports = { createOrder, verifySignature };
