const UserSubscription = require("../module/userSubscription.model");
const SubscriptionPlan = require("../module/subscriptionPlan.model");
const SubscriptionTransaction = require("../module/subscriptionTransaction.model");
const { createOrder: createRazorpayOrder } = require("../utils/razorpay");
const { getPlatformSettings } = require("./subscriptionCommission.service");
const { recordSubscriptionPaymentSplit } = require("./subscriptionCommission.service");
const { postLedgerEntry } = require("./walletLedger.service");
const { scheduleSubscriptionDeliveries } = require("./subscriptionSchedule.service");
const {
  notifyUserSubscriptionEvent,
  notifyPartnerSubscription
} = require("./subscriptionNotification.service");
const { logAudit } = require("./subscriptionAudit.service");

const DAY_MS = 24 * 60 * 60 * 1000;

async function findExpiringSubscriptions(daysAhead) {
  const now = new Date();
  const target = new Date(now.getTime() + daysAhead * DAY_MS);
  const dayStart = new Date(target);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(target);
  dayEnd.setHours(23, 59, 59, 999);

  return UserSubscription.find({
    status: "ACTIVE",
    endDate: { $gte: dayStart, $lte: dayEnd }
  }).populate("partnerId", "kitchenName");
}

async function sendRenewalReminders() {
  const settings = await getPlatformSettings();
  const days = settings.renewalReminderDays || [7, 3, 1];
  let sent = 0;

  for (const d of days) {
    const subs = await findExpiringSubscriptions(d);
    for (const sub of subs) {
      await notifyUserSubscriptionEvent(sub.userId, {
        title: "Subscription renewal",
        message: `Your meal plan expires in ${d} day(s). ${sub.autoRenew ? "Auto-renew is on." : "Renew to continue deliveries."}`,
        type: "RENEWAL_REMINDER"
      });
      sent += 1;
    }
  }
  return { sent };
}

async function attemptAutoRenewal(sub) {
  const plan = await SubscriptionPlan.findById(sub.subscriptionPlanId);
  if (!plan?.autoRenewAllowed && !sub.autoRenew) return null;
  if (!sub.autoRenew) return null;

  const settings = await getPlatformSettings();
  const maxAttempts = (settings.renewalRetryDays || [1, 3, 5]).length;

  if (sub.renewalAttempts >= maxAttempts) {
    sub.status = "EXPIRED";
    await sub.save();
    await notifyUserSubscriptionEvent(sub.userId, {
      title: "Subscription expired",
      message: "Auto-renewal failed after multiple attempts.",
      type: "RENEWAL_FAILED"
    });
    return null;
  }

  const amount = plan.discountedPrice ?? plan.totalPrice;

  if (sub.payment?.method === "WALLET") {
    try {
      await postLedgerEntry({
        ownerType: "USER",
        ownerId: sub.userId,
        type: "DEBIT",
        source: "SUBSCRIPTION_PAYMENT",
        amount,
        referenceType: "UserSubscription",
        referenceId: sub._id,
        notes: "Auto-renewal"
      });

      const split = await recordSubscriptionPaymentSplit({
        userId: sub.userId,
        partnerId: sub.partnerId,
        totalAmount: amount,
        userSubscriptionId: sub._id,
        paymentMethod: "WALLET"
      });

      const start = new Date(sub.endDate.getTime() + DAY_MS);
      const end = new Date(start.getTime() + (plan.durationInDays - 1) * DAY_MS);
      sub.startDate = start;
      sub.endDate = end;
      sub.renewalAttempts = 0;
      sub.status = "ACTIVE";
      sub.payment.paymentStatus = "PAID";
      await sub.save();

      await SubscriptionTransaction.create({
        userSubscriptionId: sub._id,
        userId: sub.userId,
        partnerId: sub.partnerId,
        type: "RENEWAL",
        amount,
        commissionAmount: split.commissionAmount,
        partnerNetAmount: split.partnerNetAmount,
        paymentMethod: "WALLET",
        paymentStatus: "PAID"
      });

      await scheduleSubscriptionDeliveries(sub, plan);

      await notifyPartnerSubscription(sub.partnerId, {
        title: "Subscription renewed",
        message: "A subscriber renewed their plan.",
        type: "RENEWAL"
      });

      return sub;
    } catch (err) {
      sub.renewalAttempts = (sub.renewalAttempts || 0) + 1;
      await sub.save();
      return null;
    }
  }

  if (sub.payment?.method === "RAZORPAY") {
    const razorpayOrder = await createRazorpayOrder(Math.round(amount * 100));
    sub.payment.gatewayOrderId = razorpayOrder.id;
    sub.payment.paymentStatus = "PENDING";
    sub.status = "PENDING_PAYMENT";
    sub.renewalAttempts = (sub.renewalAttempts || 0) + 1;
    await sub.save();
    await notifyUserSubscriptionEvent(sub.userId, {
      title: "Complete renewal payment",
      message: "Please complete payment to renew your subscription.",
      type: "RENEWAL_PAYMENT"
    });
    return { razorpayOrder, subscription: sub };
  }

  return null;
}

async function runRenewalJob() {
  const settings = await getPlatformSettings();
  await sendRenewalReminders();

  const now = new Date();
  const graceEnd = new Date(now.getTime() - (settings.renewalGraceDays || 5) * DAY_MS);

  const dueRenew = await UserSubscription.find({
    status: "ACTIVE",
    endDate: { $lte: now },
    autoRenew: true
  });

  let renewed = 0;
  for (const sub of dueRenew) {
    const result = await attemptAutoRenewal(sub);
    if (result) renewed += 1;
  }

  const expired = await UserSubscription.updateMany(
    {
      status: "ACTIVE",
      endDate: { $lt: graceEnd },
      autoRenew: false
    },
    { $set: { status: "COMPLETED" } }
  );

  return { renewed, expired: expired.modifiedCount || 0 };
}

module.exports = {
  sendRenewalReminders,
  attemptAutoRenewal,
  runRenewalJob,
  findExpiringSubscriptions
};
