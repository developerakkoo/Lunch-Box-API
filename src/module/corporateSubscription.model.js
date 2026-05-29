const mongoose = require("mongoose");

const deliveryLocationSchema = new mongoose.Schema(
  {
    label: String,
    fullAddress: String,
    latitude: Number,
    longitude: Number,
    employeeCount: Number
  },
  { _id: true }
);

const corporateSubscriptionSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },
    contactName: String,
    contactEmail: String,
    contactPhone: String,
    employeeCount: { type: Number, default: 0 },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner"
    },
    subscriptionPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan"
    },
    billingCycle: {
      type: String,
      enum: ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"],
      default: "MONTHLY"
    },
    dedicatedPrice: Number,
    gstNumber: String,
    gstDetails: mongoose.Schema.Types.Mixed,
    deliveryLocations: [deliveryLocationSchema],
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "SUSPENDED", "CANCELLED"],
      default: "DRAFT"
    },
    adminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin"
    },
    notes: String
  },
  { timestamps: true }
);

corporateSubscriptionSchema.index({ companyName: 1 });
corporateSubscriptionSchema.index({ partnerId: 1, status: 1 });

module.exports = mongoose.model("CorporateSubscription", corporateSubscriptionSchema);
