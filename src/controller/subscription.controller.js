const SubscriptionPlan = require("../module/subscriptionPlan.model");
const UserSubscription = require("../module/userSubscription.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const SubscriptionTransaction = require("../module/subscriptionTransaction.model");
const { createOrder: createRazorpayOrder, verifySignature } = require("../utils/razorpay");
const { createPaymentIntent, retrievePaymentIntent } = require("../utils/stripe");
const { postLedgerEntry } = require("../services/walletLedger.service");
const {
  resolveCommissionPercent,
  recordSubscriptionPaymentSplit
} = require("../services/subscriptionCommission.service");
const { scheduleSubscriptionDeliveries, DAY_MS } = require("../services/subscriptionSchedule.service");
const {
  resolveAddress,
  pauseSubscription,
  resumeSubscription,
  skipDelivery,
  updateDeliveryAddress,
  cancelSubscription,
  changePlan,
  previewPauseShift,
  previewCancelRefund
} = require("../services/subscriptionLifecycle.service");
const { attachMealStatsToSubscriptions } = require("../services/subscriptionStats.service");
const { isDateInPause } = require("../services/subscriptionSchedule.service");
const { logAudit } = require("../services/subscriptionAudit.service");
const {
  notifyUserSubscriptionEvent,
  notifyPartnerSubscription
} = require("../services/subscriptionNotification.service");

exports.listPlans = async (req, res) => {
  try {
    const { kitchenId, menuItemId, mealType, planType, tag } = req.query;
    const filter = { isActive: true, visibility: "PUBLIC" };
    if (kitchenId) filter.partnerId = kitchenId;
    if (menuItemId) filter.menuItemId = menuItemId;
    if (mealType) filter.$or = [{ mealType }, { mealTypes: mealType }];
    if (planType) filter.planType = planType;
    if (tag) filter.tags = tag;

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

exports.getActiveSubscriptions = async (req, res) => {
  try {
    const subscriptions = await UserSubscription.find({
      userId: req.user.id,
      status: { $in: ["ACTIVE", "PAUSED", "PENDING_PAYMENT"] }
    })
      .populate("partnerId", "kitchenName address")
      .populate("menuItemId", "name image")
      .sort({ createdAt: -1 });

    const data = await attachMealStatsToSubscriptions(subscriptions);

    return res.status(200).json({
      message: "Active subscriptions fetched",
      data
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.purchaseSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      planId,
      startDate,
      paymentMethod = "WALLET",
      addressId,
      mealPreferences,
      autoRenew = false,
      idempotencyKey
    } = req.body;

    if (!planId) {
      return res.status(400).json({ message: "planId is required" });
    }

    if (idempotencyKey) {
      const existing = await UserSubscription.findOne({ userId, idempotencyKey });
      if (existing) {
        return res.status(200).json({
          message: "Subscription already created",
          data: existing
        });
      }
    }

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ message: "Subscription plan not found" });
    }

    const addressSnapshot = await resolveAddress(userId, addressId);
    if (!addressSnapshot?.fullAddress) {
      return res.status(400).json({ message: "Valid delivery address is required" });
    }

    const start = startDate ? new Date(startDate) : new Date();
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid startDate" });
    }

    const end = new Date(start.getTime() + (plan.durationInDays - 1) * DAY_MS);
    const payAmount = plan.discountedPrice ?? plan.totalPrice;
    const commissionPercent = await resolveCommissionPercent({
      partnerId: plan.partnerId,
      planId: plan._id
    });

    const userSubscription = await UserSubscription.create({
      userId,
      partnerId: plan.partnerId,
      menuItemId: plan.menuItemId,
      subscriptionPlanId: plan._id,
      title: plan.title,
      durationInDays: plan.durationInDays,
      pricePerMeal: plan.pricePerMeal,
      totalPrice: payAmount,
      startDate: start,
      endDate: end,
      status: paymentMethod === "WALLET" ? "ACTIVE" : "PENDING_PAYMENT",
      deliveryAddress: addressSnapshot,
      mealPreferences,
      autoRenew: Boolean(autoRenew) && plan.autoRenewAllowed,
      idempotencyKey,
      commissionPercent,
      payment: {
        method: paymentMethod,
        paymentStatus: paymentMethod === "WALLET" ? "PAID" : "PENDING"
      }
    });

    if (paymentMethod === "WALLET") {
      try {
        await postLedgerEntry({
          ownerType: "USER",
          ownerId: userId,
          type: "DEBIT",
          source: "SUBSCRIPTION_PAYMENT",
          amount: payAmount,
          gateway: "WALLET",
          referenceType: "UserSubscription",
          referenceId: userSubscription._id,
          notes: "Subscription purchased with wallet"
        });

        const split = await recordSubscriptionPaymentSplit({
          userId,
          partnerId: plan.partnerId,
          totalAmount: payAmount,
          userSubscriptionId: userSubscription._id,
          paymentMethod: "WALLET"
        });

        userSubscription.platformFeeAmount = split.commissionAmount;
        userSubscription.partnerNetAmount = split.partnerNetAmount;
        await userSubscription.save();

        const txn = await SubscriptionTransaction.create({
          userSubscriptionId: userSubscription._id,
          userId,
          partnerId: plan.partnerId,
          type: "PURCHASE",
          amount: payAmount,
          commissionAmount: split.commissionAmount,
          partnerNetAmount: split.partnerNetAmount,
          platformFeeAmount: split.commissionAmount,
          paymentMethod: "WALLET",
          paymentStatus: "PAID"
        });

        await scheduleSubscriptionDeliveries(userSubscription, plan);

        await notifyUserSubscriptionEvent(userId, {
          title: "Subscription activated",
          message: `Your ${plan.title} plan is now active.`,
          type: "ACTIVATED"
        });
        await notifyPartnerSubscription(plan.partnerId, {
          title: "New subscriber",
          message: "A customer subscribed to your meal plan.",
          type: "NEW_SUBSCRIBER"
        });

        await logAudit({
          entityType: "UserSubscription",
          entityId: userSubscription._id,
          action: "PURCHASE",
          actorType: "USER",
          actorId: userId,
          metadata: { transactionId: txn._id }
        });

        return res.status(201).json({
          message: "Subscription purchased successfully",
          data: userSubscription
        });
      } catch (payErr) {
        await UserSubscription.findByIdAndDelete(userSubscription._id);
        return res.status(400).json({ message: payErr.message });
      }
    }

    if (paymentMethod === "ONLINE") {
      return res.status(201).json({
        message: "Subscription created, complete payment to activate",
        data: userSubscription,
        requiresPaymentConfirmation: true
      });
    }

    if (paymentMethod === "STRIPE") {
      const paymentIntent = await createPaymentIntent({
        amount: Math.round(payAmount * 100),
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

const { finalizePaidSubscription } = require("../services/subscriptionPayment.service");

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
      const data = await finalizePaidSubscription(subscription);
      return res.status(200).json({
        message: "Subscription payment already confirmed",
        data
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

      if (
        subscription.payment.gatewayOrderId &&
        subscription.payment.gatewayOrderId !== razorpay_order_id
      ) {
        return res.status(400).json({ message: "Razorpay order id mismatch" });
      }

      subscription.status = "ACTIVE";
      subscription.payment.paymentStatus = "PAID";
      subscription.payment.gatewayOrderId = razorpay_order_id;
      subscription.payment.gatewayPaymentId = razorpay_payment_id;
      await subscription.save();
      await finalizePaidSubscription(subscription);

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

      subscription.status = "ACTIVE";
      subscription.payment.paymentStatus = "PAID";
      subscription.payment.gatewayOrderId = stripe_payment_intent_id;
      subscription.payment.gatewayPaymentId = stripe_payment_intent_id;
      await subscription.save();
      await finalizePaidSubscription(subscription);

      return res.status(200).json({
        message: "Subscription payment confirmed",
        data: subscription
      });
    }

    if (gateway === "MARK_PAID") {
      if (subscription.payment?.method !== "ONLINE") {
        return res.status(400).json({
          message: "Mark-paid confirmation is only for ONLINE payment method"
        });
      }

      subscription.status = "ACTIVE";
      subscription.payment.paymentStatus = "PAID";
      subscription.payment.gatewayPaymentId =
        subscription.payment.gatewayPaymentId || `mark_paid_${Date.now()}`;
      await subscription.save();
      await finalizePaidSubscription(subscription);

      return res.status(200).json({
        message: "Subscription payment marked complete",
        data: subscription
      });
    }

    return res.status(400).json({ message: "Invalid gateway" });
  } catch (error) {
    const isValidation =
      error?.name === "ValidationError" ||
      /validation failed/i.test(String(error?.message ?? ""));
    return res.status(isValidation ? 400 : 500).json({ message: error.message });
  }
};

exports.pauseSubscription = async (req, res) => {
  try {
    const sub = await pauseSubscription(req.params.subscriptionId, req.user.id, req.body);
    return res.status(200).json({ message: "Subscription paused", data: sub });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.resumeSubscription = async (req, res) => {
  try {
    const sub = await resumeSubscription(req.params.subscriptionId, req.user.id);
    return res.status(200).json({ message: "Subscription resumed", data: sub });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.skipDelivery = async (req, res) => {
  try {
    const result = await skipDelivery(
      req.params.subscriptionId,
      req.user.id,
      req.params.deliveryId
    );
    return res.status(200).json({ message: "Meal skipped", data: result });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.updateSubscriptionAddress = async (req, res) => {
  try {
    const sub = await updateDeliveryAddress(
      req.params.subscriptionId,
      req.user.id,
      req.body.addressId
    );
    return res.status(200).json({ message: "Address updated", data: sub });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const result = await cancelSubscription(req.params.subscriptionId, req.user.id, req.body);
    const data = result.subscription || result;
    const refund = result.refund;
    return res.status(200).json({
      message: refund?.netRefund
        ? `Subscription cancelled. ₹${refund.netRefund} added to your wallet.`
        : "Subscription cancelled",
      data,
      refund
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.renewSubscription = async (req, res) => {
  try {
    const sub = await UserSubscription.findOne({
      _id: req.params.subscriptionId,
      userId: req.user.id
    });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    const { attemptAutoRenewal } = require("../services/subscriptionRenewal.service");
    const result = await attemptAutoRenewal(sub);
    if (!result) {
      return res.status(400).json({ message: "Renewal could not be processed" });
    }
    return res.status(200).json({ message: "Renewal initiated", data: result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.upgradeSubscription = async (req, res) => {
  try {
    const { planId } = req.body;
    const sub = await changePlan(req.params.subscriptionId, req.user.id, planId, {
      direction: "upgrade"
    });
    return res.status(200).json({ message: "Plan upgraded", data: sub });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.downgradeSubscription = async (req, res) => {
  try {
    const { planId } = req.body;
    const sub = await changePlan(req.params.subscriptionId, req.user.id, planId, {
      direction: "downgrade"
    });
    return res.status(200).json({ message: "Plan downgraded", data: sub });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getSubscriptionTransactions = async (req, res) => {
  try {
    const filter = { userId: req.user.id };
    if (req.query.subscriptionId) {
      filter.userSubscriptionId = req.query.subscriptionId;
    }
    const txns = await SubscriptionTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);
    return res.status(200).json({ message: "Transactions fetched", data: txns });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getPausePreview = async (req, res) => {
  try {
    const sub = await UserSubscription.findOne({
      _id: req.params.subscriptionId,
      userId: req.user.id
    });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    const preview = await previewPauseShift(sub, {
      start: req.query.start,
      end: req.query.end
    });
    return res.status(200).json({ message: "Pause preview", data: preview });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getCancelPreview = async (req, res) => {
  try {
    const sub = await UserSubscription.findOne({
      _id: req.params.subscriptionId,
      userId: req.user.id
    });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    const preview = await previewCancelRefund(sub);
    return res.status(200).json({ message: "Cancel preview", data: preview });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getSubscriptionHistory = async (req, res) => {
  try {
    const subscriptions = await UserSubscription.find({ userId: req.user.id })
      .populate("partnerId", "kitchenName address")
      .populate("menuItemId", "name image")
      .sort({ createdAt: -1 });

    const data = await attachMealStatsToSubscriptions(subscriptions);

    return res.status(200).json({
      message: "Subscription history fetched successfully",
      data
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
    }).select("_id pausePeriods status");

    const ids = subscriptions.map((s) => s._id);

    const deliveries = await SubscriptionDelivery.find({
      userSubscriptionId: { $in: ids },
      deliveryDate: { $gte: now },
      status: { $in: ["PENDING", "PENDING_PARTNER", "ACCEPTED", "PREPARING", "READY"] }
    })
      .populate({
        path: "userSubscriptionId",
        populate: [
          { path: "partnerId", select: "kitchenName address" },
          { path: "menuItemId", select: "name image" }
        ]
      })
      .sort({ deliveryDate: 1 });

    const filtered = deliveries.filter((d) => {
      const sub = d.userSubscriptionId;
      if (!sub) return false;
      if (sub.status === "PAUSED") return false;
      return !isDateInPause(sub, d.deliveryDate);
    });

    return res.status(200).json({
      message: "Upcoming subscription deliveries fetched successfully",
      data: filtered
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptionDeliveriesCalendarRange = async (req, res) => {
  try {
    const userId = req.user.id;
    const { from, to } = req.query;

    if (!from || !to) {
      return res
        .status(400)
        .json({ message: "Query params 'from' and 'to' are required (ISO date strings)" });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ message: "Invalid from or to date" });
    }
    if (toDate.getTime() < fromDate.getTime()) {
      return res.status(400).json({ message: "to must be on or after from" });
    }

    const maxSpanMs = 400 * DAY_MS;
    if (toDate.getTime() - fromDate.getTime() > maxSpanMs) {
      return res.status(400).json({ message: "Date range may not exceed 400 days" });
    }

    const rangeStart = new Date(fromDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(toDate);
    rangeEnd.setHours(23, 59, 59, 999);

    const subscriptions = await UserSubscription.find({ userId }).select("_id");
    const ids = subscriptions.map((s) => s._id);
    if (ids.length === 0) {
      return res.status(200).json({
        message: "Subscription deliveries fetched successfully",
        data: []
      });
    }

    const deliveries = await SubscriptionDelivery.find({
      userSubscriptionId: { $in: ids },
      deliveryDate: { $gte: rangeStart, $lte: rangeEnd }
    })
      .populate({
        path: "userSubscriptionId",
        select: "title partnerId menuItemId",
        populate: [
          { path: "partnerId", select: "kitchenName address" },
          { path: "menuItemId", select: "name image price" }
        ]
      })
      .populate({
        path: "linkedOrderId",
        select: "status timeline orderType subscriptionDeliveryId"
      })
      .populate({
        path: "deliveryBoyId",
        select: "fullName mobileNumber profileImage"
      })
      .sort({ deliveryDate: 1 });

    return res.status(200).json({
      message: "Subscription deliveries fetched successfully",
      data: deliveries
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
