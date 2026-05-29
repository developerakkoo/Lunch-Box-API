const mongoose = require("mongoose");

const walletLedgerEntrySchema = new mongoose.Schema(
  {
    ownerType: {
      type: String,
      enum: ["USER", "PARTNER", "PLATFORM", "DRIVER"],
      required: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    type: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true
    },
    source: {
      type: String,
      enum: [
        "TOPUP",
        "ORDER_PAYMENT",
        "ORDER_REFUND",
        "SUBSCRIPTION_PAYMENT",
        "SUBSCRIPTION_REFUND",
        "SUBSCRIPTION_COMMISSION",
        "CONVENIENCE_FEE",
        "DELIVERY_MARGIN",
        "FEATURED_LISTING",
        "CORPORATE_COMMISSION",
        "CANCELLATION_FEE",
        "ADDON_COMMISSION",
        "SETTLEMENT_PAYOUT",
        "TIP",
        "REFERRAL_BONUS",
        "ADJUSTMENT",
        "DRIVER_EARNING"
      ],
      required: true
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "SUCCESS"
    },
    gateway: {
      type: String,
      enum: ["RAZORPAY", "STRIPE", "WALLET", "SYSTEM", "BANK"],
      default: "SYSTEM"
    },
    externalTxnId: { type: String, sparse: true },
    referenceType: String,
    referenceId: mongoose.Schema.Types.ObjectId,
    notes: String
  },
  { timestamps: true }
);

walletLedgerEntrySchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
walletLedgerEntrySchema.index({ referenceType: 1, referenceId: 1 });

module.exports = mongoose.model("WalletLedgerEntry", walletLedgerEntrySchema);
