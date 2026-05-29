const SettlementBatch = require("../module/settlementBatch.model");
const WalletLedgerEntry = require("../module/walletLedgerEntry.model");
const Partner = require("../module/partner.model");
const { postLedgerEntry } = require("./walletLedger.service");
const { logAudit } = require("./subscriptionAudit.service");

function weekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

async function createWeeklySettlementBatches({ weekStart, weekEnd } = {}) {
  const bounds = weekStart && weekEnd ? { weekStart, weekEnd } : weekBounds();
  const partners = await Partner.find({ status: "ACTIVE" }).select("_id kitchenName walletBalance");
  const created = [];

  for (const partner of partners) {
    const existing = await SettlementBatch.findOne({
      partnerId: partner._id,
      weekStart: bounds.weekStart
    });
    if (existing) continue;

    const credits = await WalletLedgerEntry.aggregate([
      {
        $match: {
          ownerType: "PARTNER",
          ownerId: partner._id,
          type: "CREDIT",
          createdAt: { $gte: bounds.weekStart, $lte: bounds.weekEnd },
          source: { $in: ["SUBSCRIPTION_PAYMENT", "ORDER_PAYMENT"] }
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const debits = await WalletLedgerEntry.aggregate([
      {
        $match: {
          ownerType: "PARTNER",
          ownerId: partner._id,
          type: "DEBIT",
          createdAt: { $gte: bounds.weekStart, $lte: bounds.weekEnd },
          source: "SETTLEMENT_PAYOUT"
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const totalAmount = credits[0]?.total || 0;
    const paidOut = debits[0]?.total || 0;
    const netPayable = Math.max(0, totalAmount - paidOut);
    if (netPayable <= 0) continue;

    const batch = await SettlementBatch.create({
      partnerId: partner._id,
      weekStart: bounds.weekStart,
      weekEnd: bounds.weekEnd,
      status: "PENDING",
      totalAmount,
      netPayable,
      commissionAmount: 0
    });
    created.push(batch);

    await logAudit({
      entityType: "SettlementBatch",
      entityId: batch._id,
      action: "CREATED",
      actorType: "SYSTEM",
      after: { netPayable, partnerId: partner._id }
    });
  }

  return { created: created.length, batches: created };
}

async function updateSettlementStatus(batchId, status, { bankReference, failureReason } = {}) {
  const batch = await SettlementBatch.findById(batchId);
  if (!batch) throw new Error("Settlement batch not found");

  const prev = batch.status;
  batch.status = status;
  if (status === "PROCESSING") batch.processedAt = new Date();
  if (status === "COMPLETED") {
    batch.completedAt = new Date();
    batch.bankReference = bankReference;
    if (batch.netPayable > 0) {
      await postLedgerEntry({
        ownerType: "PARTNER",
        ownerId: batch.partnerId,
        type: "DEBIT",
        source: "SETTLEMENT_PAYOUT",
        amount: batch.netPayable,
        gateway: "BANK",
        referenceType: "SettlementBatch",
        referenceId: batch._id,
        notes: `Settlement payout ${bankReference || ""}`
      });
    }
  }
  if (status === "FAILED") batch.failureReason = failureReason;
  await batch.save();

  await logAudit({
    entityType: "SettlementBatch",
    entityId: batch._id,
    action: "STATUS_CHANGE",
    actorType: "ADMIN",
    before: { status: prev },
    after: { status }
  });

  return batch;
}

module.exports = {
  weekBounds,
  createWeeklySettlementBatches,
  updateSettlementStatus
};
