const User = require("../module/user.model");
const UserSubscription = require("../module/userSubscription.model");
const SubscriptionPlan = require("../module/subscriptionPlan.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const {
  DAY_MS,
  isDateInPause,
  appendReplacementDelivery,
  scheduleSubscriptionDeliveries
} = require("./subscriptionSchedule.service");
const { getPlatformSettings } = require("./subscriptionCommission.service");
const { postLedgerEntry } = require("./walletLedger.service");
const { logAudit } = require("./subscriptionAudit.service");

async function resolveAddress(userId, addressId) {
  const user = await User.findById(userId).select("addresses");
  if (!user?.addresses?.length) return null;
  if (addressId) {
    const found = user.addresses.id(addressId);
    if (found) {
      return {
        addressId: found._id,
        fullAddress: found.fullAddress,
        latitude: found.latitude,
        longitude: found.longitude,
        label: found.label
      };
    }
  }
  const def = user.addresses.find((a) => a.isDefault) || user.addresses[0];
  return {
    addressId: def._id,
    fullAddress: def.fullAddress,
    latitude: def.latitude,
    longitude: def.longitude,
    label: def.label
  };
}

async function pauseSubscription(subscriptionId, userId, { start, end, reason }) {
  const sub = await UserSubscription.findOne({ _id: subscriptionId, userId });
  if (!sub) throw new Error("Subscription not found");
  if (!["ACTIVE", "PAUSED"].includes(sub.status)) {
    throw new Error("Subscription cannot be paused in current status");
  }

  const pauseStart = start ? new Date(start) : new Date();
  const pauseEnd = end ? new Date(end) : null;
  if (Number.isNaN(pauseStart.getTime())) throw new Error("Invalid pause start");

  const settings = await getPlatformSettings();
  const plan = await SubscriptionPlan.findById(sub.subscriptionPlanId);
  const maxPause = plan?.maxPauseDays ?? settings.defaultMaxPauseDays ?? 30;

  const existingDays = (sub.pausePeriods || []).reduce((acc, p) => {
    if (!p.end) return acc + 1;
    return acc + Math.ceil((p.end - p.start) / DAY_MS);
  }, 0);
  const newDays = pauseEnd
    ? Math.ceil((pauseEnd - pauseStart) / DAY_MS)
    : 1;
  if (existingDays + newDays > maxPause) {
    throw new Error(`Maximum pause days (${maxPause}) exceeded`);
  }

  sub.pausePeriods = sub.pausePeriods || [];
  sub.pausePeriods.push({ start: pauseStart, end: pauseEnd, reason });
  sub.status = "PAUSED";
  if (pauseEnd) {
    sub.endDate = new Date(sub.endDate.getTime() + (pauseEnd - pauseStart));
  }
  await sub.save();

  await logAudit({
    entityType: "UserSubscription",
    entityId: sub._id,
    action: "PAUSE",
    actorType: "USER",
    actorId: userId,
    after: { pausePeriods: sub.pausePeriods, status: sub.status }
  });

  return sub;
}

async function resumeSubscription(subscriptionId, userId) {
  const sub = await UserSubscription.findOne({ _id: subscriptionId, userId });
  if (!sub) throw new Error("Subscription not found");

  const open = (sub.pausePeriods || []).find((p) => !p.end);
  if (open) open.end = new Date();

  sub.status = "ACTIVE";
  await sub.save();

  await logAudit({
    entityType: "UserSubscription",
    entityId: sub._id,
    action: "RESUME",
    actorType: "USER",
    actorId: userId,
    after: { status: sub.status }
  });

  return sub;
}

async function skipDelivery(subscriptionId, userId, deliveryId) {
  const sub = await UserSubscription.findOne({ _id: subscriptionId, userId });
  if (!sub) throw new Error("Subscription not found");
  if (sub.status !== "ACTIVE") throw new Error("Subscription is not active");

  const delivery = await SubscriptionDelivery.findOne({
    _id: deliveryId,
    userSubscriptionId: subscriptionId
  });
  if (!delivery) throw new Error("Delivery not found");
  if (!["PENDING", "PENDING_PARTNER"].includes(delivery.status)) {
    throw new Error("Delivery cannot be skipped in current status");
  }

  const plan = await SubscriptionPlan.findById(sub.subscriptionPlanId);
  const settings = await getPlatformSettings();
  const cutoffHours = plan?.skipCutoffHours ?? settings.defaultSkipCutoffHours ?? 12;
  const cutoffMs = cutoffHours * 60 * 60 * 1000;
  if (delivery.deliveryDate.getTime() - Date.now() < cutoffMs) {
    throw new Error(`Skip must be at least ${cutoffHours} hours before delivery`);
  }

  const maxSkip = plan?.maxSkipCount ?? settings.defaultMaxSkipCount ?? 10;
  if ((sub.skippedMealCount || 0) >= maxSkip) {
    throw new Error(`Maximum skip count (${maxSkip}) reached`);
  }

  delivery.status = "SKIPPED";
  delivery.skippedAt = new Date();
  delivery.timeline = delivery.timeline || {};
  delivery.timeline.cancelledAt = new Date();
  await delivery.save();

  sub.skippedMealCount = (sub.skippedMealCount || 0) + 1;
  sub.mealCredits = (sub.mealCredits || 0) + 1;
  await sub.save();
  await appendReplacementDelivery(sub, plan);

  await logAudit({
    entityType: "SubscriptionDelivery",
    entityId: delivery._id,
    action: "SKIP",
    actorType: "USER",
    actorId: userId,
    metadata: { subscriptionId }
  });

  return { subscription: sub, delivery };
}

async function updateDeliveryAddress(subscriptionId, userId, addressId) {
  const sub = await UserSubscription.findOne({ _id: subscriptionId, userId });
  if (!sub) throw new Error("Subscription not found");
  const snapshot = await resolveAddress(userId, addressId);
  if (!snapshot?.fullAddress) throw new Error("Valid address required");

  sub.deliveryAddress = snapshot;
  await sub.save();
  return sub;
}

async function cancelSubscription(subscriptionId, userId, { reason } = {}) {
  const sub = await UserSubscription.findOne({ _id: subscriptionId, userId });
  if (!sub) throw new Error("Subscription not found");
  if (["CANCELLED", "COMPLETED", "EXPIRED"].includes(sub.status)) {
    throw new Error("Subscription already ended");
  }

  sub.status = "CANCELLED";
  await sub.save();

  await SubscriptionDelivery.updateMany(
    {
      userSubscriptionId: sub._id,
      status: { $in: ["PENDING", "PENDING_PARTNER"] }
    },
    { $set: { status: "CANCELLED" } }
  );

  await logAudit({
    entityType: "UserSubscription",
    entityId: sub._id,
    action: "CANCEL",
    actorType: "USER",
    actorId: userId,
    metadata: { reason }
  });

  return sub;
}

async function changePlan(subscriptionId, userId, newPlanId, { direction = "upgrade" } = {}) {
  const sub = await UserSubscription.findOne({ _id: subscriptionId, userId });
  if (!sub) throw new Error("Subscription not found");
  if (sub.status !== "ACTIVE") throw new Error("Only active subscriptions can change plan");

  const newPlan = await SubscriptionPlan.findById(newPlanId);
  if (!newPlan || !newPlan.isActive) throw new Error("Plan not found");

  const priceDiff = newPlan.totalPrice - sub.totalPrice;
  sub.subscriptionPlanId = newPlan._id;
  sub.title = newPlan.title;
  sub.pricePerMeal = newPlan.pricePerMeal;
  sub.totalPrice = newPlan.totalPrice;
  sub.durationInDays = newPlan.durationInDays;
  if (priceDiff > 0 && direction === "upgrade") {
    await postLedgerEntry({
      ownerType: "USER",
      ownerId: userId,
      type: "DEBIT",
      source: "SUBSCRIPTION_PAYMENT",
      amount: priceDiff,
      referenceType: "UserSubscription",
      referenceId: sub._id,
      notes: "Plan upgrade proration"
    });
  }
  await sub.save();

  await logAudit({
    entityType: "UserSubscription",
    entityId: sub._id,
    action: direction === "upgrade" ? "UPGRADE" : "DOWNGRADE",
    actorType: "USER",
    actorId: userId,
    after: { planId: newPlanId }
  });

  return sub;
}

module.exports = {
  resolveAddress,
  pauseSubscription,
  resumeSubscription,
  skipDelivery,
  updateDeliveryAddress,
  cancelSubscription,
  changePlan
};
