const mongoose = require("mongoose");

const partnerNotificationSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        "NEW_ORDER",
        "ORDER_CANCELLED",
        "ORDER_UPDATED",
        "SUBSCRIPTION_ORDER",
        "SYSTEM"
      ],
      default: "SYSTEM"
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    data: {
      type: mongoose.Schema.Types.Mixed
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

partnerNotificationSchema.index({ partnerId: 1, createdAt: -1 });

module.exports = mongoose.model("PartnerNotification", partnerNotificationSchema);
