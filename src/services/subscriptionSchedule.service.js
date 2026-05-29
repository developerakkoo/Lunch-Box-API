const SubscriptionPlan = require("../module/subscriptionPlan.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const UserSubscription = require("../module/userSubscription.model");
const { getPlatformSettings } = require("./subscriptionCommission.service");
const { logAudit } = require("./subscriptionAudit.service");

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
  if (subscription.status === "PAUSED") return true;
  const d = startOfDay(date).getTime();
  for (const p of subscription.pausePeriods || []) {
    const s = startOfDay(p.start).getTime();
    const e = p.end ? endOfDay(p.end).getTime() : Number.MAX_SAFE_INTEGER;
    if (d >= s && d <= e) return true;
  }
  return false;
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
  if (activated > 0 && global.io) {
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
    }
    for (const [partnerId, list] of Object.entries(byPartner)) {
      for (const delivery of list) {
        global.io.to(`kitchen_${partnerId}`).emit("new_subscription_delivery", delivery);
      }
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
  scheduleSubscriptionDeliveries,
  appendReplacementDelivery,
  activateDueDeliveries,
  getTomorrowDemandByPartner,
  resolveMealTypesForPlan
};
