const SubscriptionPlan = require("../module/subscriptionPlan.model");
const SubscriptionTransaction = require("../module/subscriptionTransaction.model");
const { recordSubscriptionPaymentSplit } = require("./subscriptionCommission.service");
const { scheduleSubscriptionDeliveries } = require("./subscriptionSchedule.service");
const {
  notifyUserSubscriptionEvent,
  notifyPartnerSubscription
} = require("./subscriptionNotification.service");

async function finalizePaidSubscription(subscription) {
  const plan = await SubscriptionPlan.findById(subscription.subscriptionPlanId);
  const split = await recordSubscriptionPaymentSplit({
    userId: subscription.userId,
    partnerId: subscription.partnerId,
    totalAmount: subscription.totalPrice,
    userSubscriptionId: subscription._id,
    paymentMethod: subscription.payment.method
  });

  subscription.platformFeeAmount = split.commissionAmount;
  subscription.partnerNetAmount = split.partnerNetAmount;
  if (subscription.status === "PENDING_PAYMENT") {
    subscription.status = "ACTIVE";
  }
  await subscription.save();

  const existingTxn = await SubscriptionTransaction.findOne({
    userSubscriptionId: subscription._id,
    type: "PURCHASE",
    paymentStatus: "PAID"
  });
  if (!existingTxn) {
    await SubscriptionTransaction.create({
      userSubscriptionId: subscription._id,
      userId: subscription.userId,
      partnerId: subscription.partnerId,
      type: "PURCHASE",
      amount: subscription.totalPrice,
      commissionAmount: split.commissionAmount,
      partnerNetAmount: split.partnerNetAmount,
      platformFeeAmount: split.commissionAmount,
      paymentMethod: subscription.payment.method,
      paymentStatus: "PAID",
      gatewayOrderId: subscription.payment.gatewayOrderId,
      gatewayPaymentId: subscription.payment.gatewayPaymentId
    });
  }

  const count = await require("../module/subscriptionDelivery.model").countDocuments({
    userSubscriptionId: subscription._id
  });
  if (count === 0) {
    await scheduleSubscriptionDeliveries(subscription, plan);
  }

  await notifyUserSubscriptionEvent(subscription.userId, {
    title: "Subscription activated",
    message: "Payment received. Your plan is active.",
    type: "ACTIVATED"
  });
  await notifyPartnerSubscription(subscription.partnerId, {
    title: "New subscriber",
    message: "A customer subscribed to your meal plan.",
    type: "NEW_SUBSCRIBER"
  });

  return subscription;
}

module.exports = { finalizePaidSubscription };
