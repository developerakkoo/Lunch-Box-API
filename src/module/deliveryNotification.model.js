const mongoose = require("mongoose");

const deliveryNotificationSchema = new mongoose.Schema(
  {
    deliveryAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryAgent",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        "ORDER_ASSIGNED",
        "ORDER_ACCEPTED",
        "ORDER_REJECTED",
        "ORDER_COMPLETED",
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
    data: mongoose.Schema.Types.Mixed,
    isRead: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

deliveryNotificationSchema.index({ deliveryAgentId: 1, createdAt: -1 });

module.exports = mongoose.model("DeliveryNotification", deliveryNotificationSchema);
