const mongoose = require("mongoose");
const User = require("../module/user.model");
const Partner = require("../module/partner.model");
const DeliveryAgent = require("../module/Delivery_Agent");
const WalletLedgerEntry = require("../module/walletLedgerEntry.model");
const WalletTransaction = require("../module/walletTransaction.model");

const PLATFORM_OWNER_ID = new mongoose.Types.ObjectId("000000000000000000000001");

async function resolveOwner(ownerType, ownerId) {
  if (ownerType === "PLATFORM") {
    return { model: null, doc: null, balance: 0, id: PLATFORM_OWNER_ID };
  }
  if (ownerType === "USER") {
    const doc = await User.findById(ownerId);
    if (!doc) throw new Error("User not found");
    return { model: User, doc, balance: doc.walletBalance || 0, id: doc._id };
  }
  if (ownerType === "PARTNER") {
    const doc = await Partner.findById(ownerId);
    if (!doc) throw new Error("Partner not found");
    return { model: Partner, doc, balance: doc.walletBalance || 0, id: doc._id };
  }
  if (ownerType === "DRIVER") {
    const doc = await DeliveryAgent.findById(ownerId);
    if (!doc) throw new Error("Delivery agent not found");
    const balance = doc.earnings?.walletBalance ?? doc.earnings?.total ?? 0;
    return { model: DeliveryAgent, doc, balance, id: doc._id };
  }
  throw new Error(`Invalid ownerType: ${ownerType}`);
}

async function persistBalance(ownerType, doc, model, newBalance) {
  if (ownerType === "PLATFORM" || !doc || !model) return;
  if (ownerType === "DRIVER") {
    doc.earnings = doc.earnings || {};
    doc.earnings.walletBalance = newBalance;
    if (typeof doc.earnings.total !== "number") {
      doc.earnings.total = newBalance;
    }
  } else {
    doc.walletBalance = newBalance;
  }
  await doc.save();
}

/**
 * Unified ledger entry — updates cached balance for USER/PARTNER/DRIVER.
 */
async function postLedgerEntry({
  ownerType,
  ownerId,
  type,
  source,
  amount,
  gateway = "SYSTEM",
  externalTxnId,
  referenceType,
  referenceId,
  notes,
  status = "SUCCESS"
}) {
  const amt = Math.abs(Number(amount));
  if (!amt || Number.isNaN(amt)) {
    throw new Error("Invalid ledger amount");
  }

  const owner = await resolveOwner(ownerType, ownerId);
  const balanceBefore = owner.balance;
  const balanceAfter =
    type === "CREDIT" ? balanceBefore + amt : Math.max(0, balanceBefore - amt);

  if (type === "DEBIT" && balanceBefore < amt && ownerType !== "PLATFORM") {
    throw new Error("Insufficient balance");
  }

  const entry = await WalletLedgerEntry.create({
    ownerType,
    ownerId: owner.id,
    type,
    source,
    amount: amt,
    balanceBefore,
    balanceAfter,
    status,
    gateway,
    externalTxnId,
    referenceType,
    referenceId,
    notes
  });

  await persistBalance(ownerType, owner.doc, owner.model, balanceAfter);

  if (ownerType === "USER") {
    await WalletTransaction.create({
      userId: owner.id,
      type,
      source: mapSourceToLegacy(source),
      amount: amt,
      balanceBefore,
      balanceAfter,
      status,
      gateway,
      externalTxnId,
      referenceType,
      referenceId,
      notes
    });
  }

  return entry;
}

function mapSourceToLegacy(source) {
  const allowed = WalletTransaction.schema.path("source").enumValues;
  if (allowed.includes(source)) return source;
  if (source === "SUBSCRIPTION_COMMISSION") return "ADJUSTMENT";
  if (source === "DRIVER_EARNING") return "ADJUSTMENT";
  return "ADJUSTMENT";
}

async function getBalance(ownerType, ownerId) {
  const owner = await resolveOwner(ownerType, ownerId);
  return owner.balance;
}

async function transfer({
  fromOwnerType,
  fromOwnerId,
  toOwnerType,
  toOwnerId,
  amount,
  source,
  referenceType,
  referenceId,
  notes
}) {
  const debit = await postLedgerEntry({
    ownerType: fromOwnerType,
    ownerId: fromOwnerId,
    type: "DEBIT",
    source,
    amount,
    referenceType,
    referenceId,
    notes: notes || `Transfer to ${toOwnerType}`
  });
  const credit = await postLedgerEntry({
    ownerType: toOwnerType,
    ownerId: toOwnerId,
    type: "CREDIT",
    source,
    amount,
    referenceType,
    referenceId,
    notes: notes || `Transfer from ${fromOwnerType}`
  });
  return { debit, credit };
}

module.exports = {
  PLATFORM_OWNER_ID,
  postLedgerEntry,
  getBalance,
  transfer,
  resolveOwner
};
