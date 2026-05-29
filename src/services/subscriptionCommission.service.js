const PlatformSettings = require("../module/platformSettings.model");
const Partner = require("../module/partner.model");
const SubscriptionPlan = require("../module/subscriptionPlan.model");
const { postLedgerEntry, PLATFORM_OWNER_ID } = require("./walletLedger.service");

async function getPlatformSettings() {
  let settings = await PlatformSettings.findOne({ key: "default" });
  if (!settings) {
    settings = await PlatformSettings.create({ key: "default" });
  }
  return settings;
}

async function resolveCommissionPercent({ partnerId, planId }) {
  const settings = await getPlatformSettings();
  if (planId) {
    const plan = await SubscriptionPlan.findById(planId).select("commissionOverridePercent");
    if (plan?.commissionOverridePercent != null) {
      return plan.commissionOverridePercent;
    }
  }
  const partner = await Partner.findById(partnerId).select("subscriptionCommissionPercent");
  if (partner?.subscriptionCommissionPercent != null) {
    return partner.subscriptionCommissionPercent;
  }
  return settings.subscriptionCommissionPercent ?? 20;
}

function splitAmount(totalAmount, commissionPercent) {
  const total = Math.round(Number(totalAmount) * 100) / 100;
  const commissionAmount = Math.round((total * commissionPercent) / 100 * 100) / 100;
  const partnerNetAmount = Math.round((total - commissionAmount) * 100) / 100;
  return { total, commissionAmount, partnerNetAmount, commissionPercent };
}

/**
 * User pays total → platform commission + partner net (ledger credits).
 * Wallet path debits user first via caller.
 */
async function recordSubscriptionPaymentSplit({
  userId,
  partnerId,
  totalAmount,
  userSubscriptionId,
  subscriptionTransactionId,
  paymentMethod = "WALLET"
}) {
  const commissionPercent = await resolveCommissionPercent({
    partnerId,
    planId: null
  });
  const plan = userSubscriptionId
    ? await require("../module/userSubscription.model")
        .findById(userSubscriptionId)
        .select("subscriptionPlanId")
    : null;
  const pct = plan?.subscriptionPlanId
    ? await resolveCommissionPercent({ partnerId, planId: plan.subscriptionPlanId })
    : commissionPercent;

  const { commissionAmount, partnerNetAmount, commissionPercent: appliedPct } = splitAmount(
    totalAmount,
    pct
  );

  const gateway = paymentMethod === "WALLET" ? "WALLET" : paymentMethod === "RAZORPAY" ? "RAZORPAY" : "STRIPE";

  const platformEntry = await postLedgerEntry({
    ownerType: "PLATFORM",
    ownerId: PLATFORM_OWNER_ID,
    type: "CREDIT",
    source: "SUBSCRIPTION_COMMISSION",
    amount: commissionAmount,
    gateway,
    referenceType: "UserSubscription",
    referenceId: userSubscriptionId,
    notes: `Commission ${appliedPct}% on subscription payment`
  });

  const partnerEntry = await postLedgerEntry({
    ownerType: "PARTNER",
    ownerId: partnerId,
    type: "CREDIT",
    source: "SUBSCRIPTION_PAYMENT",
    amount: partnerNetAmount,
    gateway,
    referenceType: "UserSubscription",
    referenceId: userSubscriptionId,
    notes: "Partner net from subscription"
  });

  return {
    commissionPercent: appliedPct,
    commissionAmount,
    partnerNetAmount,
    platformEntry,
    partnerEntry
  };
}

module.exports = {
  getPlatformSettings,
  resolveCommissionPercent,
  splitAmount,
  recordSubscriptionPaymentSplit
};
