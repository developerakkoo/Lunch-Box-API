const mongoose = require("mongoose");

const adminNotificationSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
      index: true
    },
    type: {
      type: String,
      enum: [
        "SUPPORT_NEW_TICKET",
        "SUPPORT_USER_REPLY",
        "SUPPORT_USER_RESOLVED",
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

adminNotificationSchema.index({ adminId: 1, createdAt: -1 });
adminNotificationSchema.index({ adminId: 1, isRead: 1 });

module.exports = mongoose.model("AdminNotification", adminNotificationSchema);
