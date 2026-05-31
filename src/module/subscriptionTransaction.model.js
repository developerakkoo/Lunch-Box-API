const mongoose = require("mongoose");

const subscriptionTransactionSchema = new mongoose.Schema(
  {
    userSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSubscription",
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true
    },
    type: {
      type: String,
      enum: ["PURCHASE", "RENEWAL", "REFUND", "UPGRADE", "DOWNGRADE", "CANCELLATION_FEE"],
      required: true
    },
    amount: { type: Number, required: true },
    commissionAmount: { type: Number, default: 0 },
    partnerNetAmount: { type: Number, default: 0 },
    platformFeeAmount: { type: Number, default: 0 },
    paymentMethod: {
      type: String,
      enum: ["WALLET", "ONLINE", "RAZORPAY", "STRIPE"]
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      default: "PENDING"
    },
    gatewayOrderId: String,
    gatewayPaymentId: String,
    invoiceNumber: String,
    gstDetails: mongoose.Schema.Types.Mixed,
    ledgerEntryIds: [mongoose.Schema.Types.ObjectId]
  },
  { timestamps: true }
);

subscriptionTransactionSchema.index({ userSubscriptionId: 1, createdAt: -1 });
subscriptionTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("SubscriptionTransaction", subscriptionTransactionSchema);
