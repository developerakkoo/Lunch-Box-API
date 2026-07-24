const SubscriptionPlan = require("../module/subscriptionPlan.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const UserSubscription = require("../module/userSubscription.model");
const { getPlatformSettings } = require("./subscriptionCommission.service");
const { logAudit } = require("./subscriptionAudit.service");
const { notifyPartner } = require("../utils/partnerNotification");

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function resolveMealTypesForPlan(plan) {
  if (plan.mealTypes?.length) return plan.mealTypes;
  if (plan.mealType === "BOTH") return ["LUNCH", "DINNER"];
  if (plan.mealType === "BREAKFAST") return ["BREAKFAST"];
  if (plan.mealType === "DINNER") return ["DINNER"];
  if (plan.mealType === "CUSTOM") return ["CUSTOM"];
  return ["LUNCH"];
}

function isDateInPause(subscription, date) {
  const d = startOfDay(date).getTime();
  for (const p of subscription.pausePeriods || []) {
    const s = startOfDay(p.start).getTime();
    const e = p.end ? endOfDay(p.end).getTime() : Number.MAX_SAFE_INTEGER;
    if (d >= s && d <= e) return true;
  }
  return false;
}

function eachDayInRange(from, to) {
  const days = [];
  let cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    days.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return days;
}

async function findOccupiedDates(subscriptionId, excludeDeliveryId = null) {
  const deliveries = await SubscriptionDelivery.find({
    userSubscriptionId: subscriptionId,
    status: { $nin: ["CANCELLED", "SKIPPED", "REJECTED"] }
  }).select("deliveryDate _id");

  const occupied = new Set();
  for (const d of deliveries) {
    if (excludeDeliveryId && String(d._id) === String(excludeDeliveryId)) continue;
    occupied.add(startOfDay(d.deliveryDate).getTime());
  }
  return occupied;
}

async function findNextFreeDate(subscriptionId, fromDate, occupiedOverride = null) {
  const occupied = occupiedOverride || (await findOccupiedDates(subscriptionId));
  let candidate = startOfDay(fromDate);
  while (occupied.has(candidate.getTime())) {
    candidate = new Date(candidate.getTime() + DAY_MS);
  }
  occupied.add(candidate.getTime());
  return candidate;
}

async function shiftDeliveriesInPauseWindow(subscription, pauseStart, pauseEnd, { dryRun = false } = {}) {
  if (!pauseEnd) throw new Error("Pause end date is required");

  const windowStart = startOfDay(pauseStart);
  const windowEnd = startOfDay(pauseEnd);
  const pauseDays = eachDayInRange(windowStart, windowEnd);

  const deliveries = await SubscriptionDelivery.find({
    userSubscriptionId: subscription._id,
    status: { $in: ["PENDING", "PENDING_PARTNER"] }
  }).sort({ deliveryDate: 1 });

  let shiftedCount = 0;
  const occupied = await findOccupiedDates(subscription._id);
  const updates = [];

  for (const pauseDay of pauseDays) {
    const dayStart = startOfDay(pauseDay);
    const dayEnd = endOfDay(pauseDay);
    const dayDeliveries = deliveries.filter((d) => {
      const t = d.deliveryDate.getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
    });

    for (const delivery of dayDeliveries) {
      occupied.delete(startOfDay(delivery.deliveryDate).getTime());
      const targetDate = await findNextFreeDate(
        subscription._id,
        new Date(dayStart.getTime() + DAY_MS),
        occupied
      );
      updates.push({
        deliveryId: delivery._id,
        fromDate: delivery.deliveryDate,
        toDate: targetDate,
        revertPartnerQueue: delivery.status === "PENDING_PARTNER"
      });
      shiftedCount += 1;
    }
  }

  const newEndDate = new Date(subscription.endDate.getTime() + shiftedCount * DAY_MS);

  if (dryRun) {
    return { shiftedCount, newEndDate, updates };
  }

  for (const update of updates) {
    await SubscriptionDelivery.updateOne(
      { _id: update.deliveryId },
      {
        $set: {
          deliveryDate: startOfDay(update.toDate),
          status: "PENDING",
          activatedAt: null
        }
      }
    );
  }

  subscription.endDate = newEndDate;
  return { shiftedCount, newEndDate, updates };
}

async function scheduleSubscriptionDeliveries(userSubscription, planDoc) {
  const plan =
    planDoc ||
    (await SubscriptionPlan.findById(userSubscription.subscriptionPlanId));
  const mealTypes = resolveMealTypesForPlan(plan || {});
  const mealsPerDay = Math.max(plan?.mealsPerDay || mealTypes.length || 1, 1);
  const slots = plan?.deliveryTimeSlots?.length ? plan.deliveryTimeSlots : [null];

  const deliveries = [];
  let dayIndex = 0;
  const totalDays = userSubscription.durationInDays;

  while (dayIndex < totalDays) {
    const deliveryDate = new Date(
      userSubscription.startDate.getTime() + dayIndex * DAY_MS
    );
    if (!isDateInPause(userSubscription, deliveryDate)) {
      const typesForDay = mealTypes.slice(0, mealsPerDay);
      for (let m = 0; m < typesForDay.length; m += 1) {
        deliveries.push({
          userSubscriptionId: userSubscription._id,
          deliveryDate: startOfDay(deliveryDate),
          mealType: typesForDay[m],
          timeSlot: slots[m % slots.length] || slots[0] || null,
          status: "PENDING"
        });
      }
    }
    dayIndex += 1;
  }

  if (deliveries.length > 0) {
    await SubscriptionDelivery.insertMany(deliveries);
  }
  return deliveries.length;
}

async function appendReplacementDelivery(userSubscription, plan) {
  const newEnd = new Date(userSubscription.endDate.getTime() + DAY_MS);
  userSubscription.endDate = newEnd;
  userSubscription.mealCredits = Math.max(0, (userSubscription.mealCredits || 0) - 1);
  await userSubscription.save();

  const mealTypes = resolveMealTypesForPlan(plan || {});
  await SubscriptionDelivery.create({
    userSubscriptionId: userSubscription._id,
    deliveryDate: startOfDay(newEnd),
    mealType: mealTypes[0] || "LUNCH",
    status: "PENDING",
    mealCreditApplied: true
  });
}

async function activateDueDeliveries({ targetDate } = {}) {
  const settings = await getPlatformSettings();
  const leadDays = settings.activationLeadDays ?? 1;
  const base = targetDate ? new Date(targetDate) : new Date();
  const activateFor = new Date(base.getTime() + leadDays * DAY_MS);
  const dayStart = startOfDay(activateFor);
  const dayEnd = endOfDay(activateFor);

  const activeSubs = await UserSubscription.find({ status: "ACTIVE" }).select(
    "_id pausePeriods status"
  );
  const activeIds = activeSubs
    .filter((s) => !isDateInPause(s, activateFor))
    .map((s) => s._id);

  if (activeIds.length === 0) return { activated: 0 };

  const result = await SubscriptionDelivery.updateMany(
    {
      userSubscriptionId: { $in: activeIds },
      deliveryDate: { $gte: dayStart, $lte: dayEnd },
      status: "PENDING"
    },
    {
      $set: { status: "PENDING_PARTNER", activatedAt: new Date() }
    }
  );

  const activated = result.modifiedCount || 0;
  if (activated > 0) {
    const deliveries = await SubscriptionDelivery.find({
      userSubscriptionId: { $in: activeIds },
      deliveryDate: { $gte: dayStart, $lte: dayEnd },
      status: "PENDING_PARTNER"
    }).populate("userSubscriptionId");

    const byPartner = {};
    for (const d of deliveries) {
      const pid = String(d.userSubscriptionId?.partnerId);
      if (!byPartner[pid]) byPartner[pid] = [];
      byPartner[pid].push(d);

      const userId = d.userSubscriptionId?.userId;
      if (global.io && userId) {
        global.io.to(`user_${userId}`).emit("subscription_delivery_update", { delivery: d });
      }
    }
    const dateLabel = dayStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    for (const [partnerId, list] of Object.entries(byPartner)) {
      if (global.io) {
        for (const delivery of list) {
          global.io.to(`kitchen_${partnerId}`).emit("new_subscription_delivery", delivery);
        }
      }
      await notifyPartner({
        partnerId,
        type: "SUBSCRIPTION_ORDER",
        title: "Subscription meals to accept",
        message: `You have ${list.length} subscription meal(s) awaiting acceptance for ${dateLabel}.`,
        data: {
          type: "SUBSCRIPTION",
          deliveryIds: list.map((d) => String(d._id)),
          deliveryDate: dayStart.toISOString()
        }
      }).catch(() => {});
    }
  }

  return { activated };
}

async function getTomorrowDemandByPartner() {
  const tomorrow = new Date(Date.now() + DAY_MS);
  const dayStart = startOfDay(tomorrow);
  const dayEnd = endOfDay(tomorrow);

  const rows = await SubscriptionDelivery.aggregate([
    {
      $match: {
        deliveryDate: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ["PENDING", "PENDING_PARTNER"] }
      }
    },
    {
      $lookup: {
        from: "usersubscriptions",
        localField: "userSubscriptionId",
        foreignField: "_id",
        as: "sub"
      }
    },
    { $unwind: "$sub" },
    { $match: { "sub.status": "ACTIVE" } },
    {
      $group: {
        _id: "$sub.partnerId",
        count: { $sum: 1 }
      }
    }
  ]);
  return rows;
}

module.exports = {
  DAY_MS,
  startOfDay,
  endOfDay,
  isDateInPause,
  eachDayInRange,
  shiftDeliveriesInPauseWindow,
  scheduleSubscriptionDeliveries,
  appendReplacementDelivery,
  activateDueDeliveries,
  getTomorrowDemandByPartner,
  resolveMealTypesForPlan
};
