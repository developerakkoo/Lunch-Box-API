const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
        "TIP",
        "REFERRAL_BONUS",
        "ADJUSTMENT"
      ],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    balanceBefore: {
      type: Number,
      required: true
    },
    balanceAfter: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "SUCCESS"
    },
    gateway: {
      type: String,
      enum: ["RAZORPAY", "STRIPE", "WALLET", "SYSTEM"],
      default: "SYSTEM"
    },
    externalTxnId: {
      type: String,
      index: true,
      sparse: true
    },
    referenceType: String,
    referenceId: mongoose.Schema.Types.ObjectId,
    notes: String
  },
  { timestamps: true }
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
