const SubscriptionPlan = require("../module/subscriptionPlan.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const SubscriptionTransaction = require("../module/subscriptionTransaction.model");
const { getPlatformSettings } = require("./subscriptionCommission.service");
const {
  DAY_MS,
  startOfDay,
  endOfDay,
  shiftDeliveriesInPauseWindow
} = require("./subscriptionSchedule.service");

const DELIVERED_STATUSES = ["DELIVERED"];
const PENDING_STATUSES = [
  "PENDING",
  "PENDING_PARTNER",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY"
];
const REFUNDABLE_STATUSES = ["PENDING", "PENDING_PARTNER"];

function countPauseDays(pauseStart, pauseEnd) {
  const start = startOfDay(pauseStart);
  const end = pauseEnd ? startOfDay(pauseEnd) : start;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS) + 1);
}

function buildMealStatsFromCounts(counts, subscription) {
  const delivered = counts.delivered || 0;
  const pending = counts.pending || 0;
  const skipped = counts.skipped || 0;
  const cancelled = counts.cancelled || 0;
  const inProgress = counts.inProgress || 0;
  const totalMeals = subscription.durationInDays || delivered + pending + skipped + cancelled + inProgress;
  const accounted = delivered + pending + skipped + cancelled + inProgress;
  const remaining = Math.max(0, totalMeals - delivered - skipped - cancelled);

  return {
    delivered,
    pending: pending + inProgress,
    skipped,
    cancelled,
    remaining,
    totalMeals: Math.max(totalMeals, accounted)
  };
}

async function aggregateDeliveryCounts(subscriptionIds) {
  if (!subscriptionIds.length) return {};

  const rows = await SubscriptionDelivery.aggregate([
    { $match: { userSubscriptionId: { $in: subscriptionIds } } },
    {
      $group: {
        _id: { subId: "$userSubscriptionId", status: "$status" },
        count: { $sum: 1 }
      }
    }
  ]);

  const bySub = {};
  for (const row of rows) {
    const subId = String(row._id.subId);
    if (!bySub[subId]) {
      bySub[subId] = { delivered: 0, pending: 0, inProgress: 0, skipped: 0, cancelled: 0 };
    }
    const status = row._id.status;
    const count = row.count;
    if (DELIVERED_STATUSES.includes(status)) bySub[subId].delivered += count;
    else if (status === "SKIPPED") bySub[subId].skipped += count;
    else if (status === "CANCELLED" || status === "REJECTED") bySub[subId].cancelled += count;
    else if (["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(status)) {
      bySub[subId].inProgress += count;
    } else if (PENDING_STATUSES.includes(status)) {
      bySub[subId].pending += count;
    }
  }
  return bySub;
}

async function computeMealStatsForSubscription(subscription) {
  const subId = subscription._id;
  const counts = await aggregateDeliveryCounts([subId]);
  return buildMealStatsFromCounts(counts[String(subId)] || {}, subscription);
}

async function attachMealStatsToSubscriptions(subscriptions) {
  if (!subscriptions.length) return subscriptions;

  const ids = subscriptions.map((s) => s._id);
  const countsBySub = await aggregateDeliveryCounts(ids);

  return subscriptions.map((sub) => {
    const doc = sub.toObject ? sub.toObject() : { ...sub };
    doc.mealStats = buildMealStatsFromCounts(countsBySub[String(sub._id)] || {}, sub);
    return doc;
  });
}

async function previewPauseShift(subscription, { start, end }) {
  const pauseStart = start ? new Date(start) : new Date();
  const pauseEnd = end ? new Date(end) : null;
  if (Number.isNaN(pauseStart.getTime())) throw new Error("Invalid pause start");
  if (!pauseEnd) throw new Error("Pause end date is required");

  const simulation = await shiftDeliveriesInPauseWindow(subscription, pauseStart, pauseEnd, {
    dryRun: true
  });

  const settings = await getPlatformSettings();
  const plan = await SubscriptionPlan.findById(subscription.subscriptionPlanId);
  const maxPause = plan?.maxPauseDays ?? settings.defaultMaxPauseDays ?? 30;
  const existingDays = (subscription.pausePeriods || []).reduce((acc, p) => {
    if (!p.end) return acc + 1;
    return acc + Math.ceil((p.end - p.start) / DAY_MS);
  }, 0);
  const newDays = countPauseDays(pauseStart, pauseEnd);

  return {
    shiftedMeals: simulation.shiftedCount,
    newEndDate: simulation.newEndDate,
    pauseDaysUsed: existingDays + newDays,
    maxPauseDays: maxPause
  };
}

async function previewCancelRefund(subscription) {
  const existingRefund = await SubscriptionTransaction.findOne({
    userSubscriptionId: subscription._id,
    type: "REFUND"
  });
  if (existingRefund) {
    return {
      eligibleMeals: 0,
      grossRefund: 0,
      cancellationFee: 0,
      netRefund: 0,
      alreadyRefunded: true
    };
  }

  const eligibleMeals = await SubscriptionDelivery.countDocuments({
    userSubscriptionId: subscription._id,
    status: { $in: REFUNDABLE_STATUSES }
  });

  const grossRefund = eligibleMeals * (subscription.pricePerMeal || 0);
  const settings = await getPlatformSettings();
  const feePercent = settings.cancellationFeePercent ?? 0;
  const cancellationFee = Math.round((grossRefund * feePercent) / 100);
  const netRefund = Math.max(0, grossRefund - cancellationFee);

  return {
    eligibleMeals,
    grossRefund,
    cancellationFee,
    netRefund,
    cancellationFeePercent: feePercent,
    alreadyRefunded: false
  };
}

module.exports = {
  computeMealStatsForSubscription,
  attachMealStatsToSubscriptions,
  previewPauseShift,
  previewCancelRefund,
  REFUNDABLE_STATUSES
};
