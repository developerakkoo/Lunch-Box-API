let stripeClient = null;

try {
  const Stripe = require("stripe");
  if (process.env.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch (error) {
  stripeClient = null;
}

const ensureStripe = () => {
  if (!stripeClient) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY and install stripe package.");
  }
};

const createPaymentIntent = async ({ amount, currency = "inr", metadata = {} }) => {
  ensureStripe();
  return stripeClient.paymentIntents.create({
    amount: Math.round(amount),
    currency,
    metadata
  });
};

const retrievePaymentIntent = async (paymentIntentId) => {
  ensureStripe();
  return stripeClient.paymentIntents.retrieve(paymentIntentId);
};

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent
};
