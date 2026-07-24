const mongoose = require("mongoose");

const userNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        "SUPPORT_NEW_REPLY",
        "SUPPORT_TICKET_UPDATE",
        "SUPPORT_RATING_REQUEST",
        "SUBSCRIPTION",
        "OFFER",
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
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    isRead: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

userNotificationSchema.index({ userId: 1, createdAt: -1 });
userNotificationSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model("UserNotification", userNotificationSchema);
