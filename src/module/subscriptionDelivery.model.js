const mongoose = require("mongoose");

const subscriptionDeliverySchema = new mongoose.Schema(
  {
    userSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSubscription"
    },
    deliveryDate: { type: Date, required: true },
    mealType: {
      type: String,
      enum: ["BREAKFAST", "LUNCH", "DINNER", "CUSTOM"],
      default: "LUNCH"
    },
    timeSlot: String,
    status: {
      type: String,
      enum: [
        "PENDING",
        "PENDING_PARTNER",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "REJECTED",
        "CANCELLED",
        "SKIPPED"
      ],
      default: "PENDING"
    },
    deliveryBoyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryAgent"
    },
    linkedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null
    },
    activatedAt: Date,
    skippedAt: Date,
    skipReason: String,
    mealCreditApplied: { type: Boolean, default: false },
    timeline: {
      acceptedAt: Date,
      preparingAt: Date,
      readyAt: Date,
      pickedAt: Date,
      deliveredAt: Date,
      rejectedAt: Date,
      cancelledAt: Date
    },
    rejectionReason: String
  },
  { timestamps: true }
);

subscriptionDeliverySchema.index({ deliveryDate: 1, status: 1 });
subscriptionDeliverySchema.index({ userSubscriptionId: 1, deliveryDate: 1 });

module.exports = mongoose.model("SubscriptionDelivery", subscriptionDeliverySchema);
