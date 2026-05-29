const mongoose = require("mongoose");

const subscriptionAuditLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: [
        "UserSubscription",
        "SubscriptionDelivery",
        "SubscriptionPlan",
        "CorporateSubscription",
        "SettlementBatch"
      ],
      required: true
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    action: { type: String, required: true },
    actorType: {
      type: String,
      enum: ["USER", "PARTNER", "ADMIN", "SYSTEM", "DRIVER"],
      default: "SYSTEM"
    },
    actorId: mongoose.Schema.Types.ObjectId,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

subscriptionAuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model("SubscriptionAuditLog", subscriptionAuditLogSchema);
