const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    subscriptionCommissionPercent: { type: Number, default: 20 },
    convenienceFeePercent: { type: Number, default: 0 },
    deliveryMarginPercent: { type: Number, default: 0 },
    corporateCommissionPercent: { type: Number, default: 15 },
    cancellationFeePercent: { type: Number, default: 0 },
    defaultSkipCutoffHours: { type: Number, default: 12 },
    defaultMaxPauseDays: { type: Number, default: 30 },
    defaultMaxSkipCount: { type: Number, default: 10 },
    renewalReminderDays: { type: [Number], default: [7, 3, 1] },
    renewalRetryDays: { type: [Number], default: [1, 3, 5] },
    renewalGraceDays: { type: Number, default: 5 },
    driverDeliveryEarning: { type: Number, default: 40 },
    activationLeadDays: { type: Number, default: 1 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
