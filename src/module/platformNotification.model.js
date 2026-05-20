const mongoose = require("mongoose");

const platformNotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    audience: {
      type: String,
      enum: ["all_users", "all_partners", "all_drivers"],
      default: "all_users"
    },
    sentAt: { type: Date, default: Date.now },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    isRead: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformNotification", platformNotificationSchema);
