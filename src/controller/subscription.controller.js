const SubscriptionPlan = require("../module/subscriptionPlan.model");
const UserSubscription = require("../module/userSubscription.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const User = require("../module/user.model");
const WalletTransaction = require("../module/walletTransaction.model");
const { createOrder: createRazorpayOrder, verifySignature } = require("../utils/razorpay");
const { createPaymentIntent, retrievePaymentIntent } = require("../utils/stripe");

const DAY_MS = 24 * 60 * 60 * 1000;

const createWalletLedgerEntry = async ({
  userId,
  type,
  source,
  amount,
  balanceBefore,
  balanceAfter,
  status = "SUCCESS",
  gateway = "SYSTEM",
  externalTxnId,
  referenceType,
  referenceId,
  notes
}) => {
  return WalletTransaction.create({
    userId,
    type,
    source,
    amount,
    balanceBefore,
    balanceAfter,
    status,
    gateway,
    externalTxnId,
    referenceType,
    referenceId,
    notes
  });
};

const scheduleSubscriptionDeliveries = async (userSubscription) => {
  const deliveries = [];
  for (let i = 0; i < userSubscription.durationInDays; i += 1) {
    deliveries.push({
      userSubscriptionId: userSubscription._id,
      deliveryDate: new Date(userSubscription.startDate.getTime() + i * DAY_MS),
      status: "PENDING"
    });
  }

  if (deliveries.length > 0) {
    await SubscriptionDelivery.insertMany(deliveries);
  }
};

exports.listPlans = async (req, res) => {
  try {
    const { kitchenId, menuItemId } = req.query;
    const filter = { isActive: true };
    if (kitchenId) filter.partnerId = kitchenId;
    if (menuItemId) filter.menuItemId = menuItemId;

    const plans = await SubscriptionPlan.find(filter)
      .populate("partnerId", "kitchenName address")
      .populate("menuItemId", "name description image price");

    return res.status(200).json({
      message: "Subscription plans fetched successfully",
      data: plans
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.purchaseSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, startDate, paymentMethod = "WALLET" } = req.body;

    if (!planId) {
      return res.status(400).json({ message: "planId is required" });
    }

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ message: "Subscription plan not found" });
    }

    const start = startDate ? new Date(startDate) : new Date();
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid startDate" });
    }

    const end = new Date(start.getTime() + (plan.durationInDays - 1) * DAY_MS);

    const userSubscription = await UserSubscription.create({
      userId,
      partnerId: plan.partnerId,
      menuItemId: plan.menuItemId,
      subscriptionPlanId: plan._id,
      title: plan.title,
      durationInDays: plan.durationInDays,
      pricePerMeal: plan.pricePerMeal,
      totalPrice: plan.totalPrice,
      startDate: start,
      endDate: end,
      status: paymentMethod === "WALLET" ? "ACTIVE" : "PENDING_PAYMENT",
      payment: {
        method: paymentMethod,
        paymentStatus: paymentMethod === "WALLET" ? "PAID" : "PENDING"
      }
    });

    if (paymentMethod === "WALLET") {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if ((user.walletBalance || 0) < plan.totalPrice) {
        await UserSubscription.findByIdAndDelete(userSubscription._id);
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      const before = user.walletBalance || 0;
      user.walletBalance = before - plan.totalPrice;
      await user.save();

      await createWalletLedgerEntry({
        userId,
        type: "DEBIT",
        source: "SUBSCRIPTION_PAYMENT",
        amount: plan.totalPrice,
        balanceBefore: before,
        balanceAfter: user.walletBalance,
        gateway: "WALLET",
        referenceType: "UserSubscription",
        referenceId: userSubscription._id,
        notes: "Subscription purchased with wallet"
      });

      await scheduleSubscriptionDeliveries(userSubscription);
      return res.status(201).json({
        message: "Subscription purchased successfully",
        data: userSubscription
      });
    }

    if (paymentMethod === "RAZORPAY") {
      const razorpayOrder = await createRazorpayOrder(Math.round(plan.totalPrice * 100));
      userSubscription.payment.gatewayOrderId = razorpayOrder.id;
      await userSubscription.save();

      return res.status(201).json({
        message: "Subscription created, complete payment",
        data: userSubscription,
        razorpayOrder
      });
    }

    if (paymentMethod === "STRIPE") {
      const paymentIntent = await createPaymentIntent({
        amount: Math.round(plan.totalPrice * 100),
        currency: "inr",
        metadata: {
          userSubscriptionId: String(userSubscription._id),
          userId: String(userId),
          type: "SUBSCRIPTION"
        }
      });

      userSubscription.payment.gatewayOrderId = paymentIntent.id;
      await userSubscription.save();

      return res.status(201).json({
        message: "Subscription created, complete payment",
        data: userSubscription,
        stripePaymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency
        }
      });
    }

    await UserSubscription.findByIdAndDelete(userSubscription._id);
    return res.status(400).json({ message: "Invalid payment method" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.confirmSubscriptionPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subscriptionId } = req.params;
    const {
      gateway,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      stripe_payment_intent_id
    } = req.body;

    const subscription = await UserSubscription.findOne({
      _id: subscriptionId,
      userId
    });
    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    if (subscription.payment?.paymentStatus === "PAID") {
      return res.status(200).json({
        message: "Subscription payment already confirmed",
        data: subscription
      });
    }

    if (gateway === "RAZORPAY") {
      const valid = verifySignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });
      if (!valid) {
        return res.status(400).json({ message: "Invalid Razorpay signature" });
      }

      if (subscription.payment.gatewayOrderId && subscription.payment.gatewayOrderId !== razorpay_order_id) {
        return res.status(400).json({ message: "Razorpay order id mismatch" });
      }

      subscription.status = "ACTIVE";
      subscription.payment.paymentStatus = "PAID";
      subscription.payment.gatewayOrderId = razorpay_order_id;
      subscription.payment.gatewayPaymentId = razorpay_payment_id;
      await subscription.save();

      await scheduleSubscriptionDeliveries(subscription);

      return res.status(200).json({
        message: "Subscription payment confirmed",
        data: subscription
      });
    }

    if (gateway === "STRIPE") {
      const paymentIntent = await retrievePaymentIntent(stripe_payment_intent_id);
      if (!paymentIntent || paymentIntent.status !== "succeeded") {
        return res.status(400).json({ message: "Stripe payment not successful" });
      }

      if (
        subscription.payment.gatewayOrderId &&
        subscription.payment.gatewayOrderId !== stripe_payment_intent_id
      ) {
        return res.status(400).json({ message: "Stripe payment intent mismatch" });
      }

      subscription.status = "ACTIVE";
      subscription.payment.paymentStatus = "PAID";
      subscription.payment.gatewayOrderId = stripe_payment_intent_id;
      subscription.payment.gatewayPaymentId = stripe_payment_intent_id;
      await subscription.save();

      await scheduleSubscriptionDeliveries(subscription);

      return res.status(200).json({
        message: "Subscription payment confirmed",
        data: subscription
      });
    }

    return res.status(400).json({ message: "Invalid gateway" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptionHistory = async (req, res) => {
  try {
    const subscriptions = await UserSubscription.find({ userId: req.user.id })
      .populate("partnerId", "kitchenName address")
      .populate("menuItemId", "name image")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Subscription history fetched successfully",
      data: subscriptions
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getUpcomingSubscriptionDeliveries = async (req, res) => {
  try {
    const now = new Date();
    const subscriptions = await UserSubscription.find({
      userId: req.user.id,
      status: { $in: ["ACTIVE", "PAUSED"] }
    }).select("_id");

    const ids = subscriptions.map((s) => s._id);

    const deliveries = await SubscriptionDelivery.find({
      userSubscriptionId: { $in: ids },
      deliveryDate: { $gte: now },
      status: "PENDING"
    })
      .populate({
        path: "userSubscriptionId",
        populate: [
          { path: "partnerId", select: "kitchenName address" },
          { path: "menuItemId", select: "name image" }
        ]
      })
      .sort({ deliveryDate: 1 });

    return res.status(200).json({
      message: "Upcoming subscription deliveries fetched successfully",
      data: deliveries
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
