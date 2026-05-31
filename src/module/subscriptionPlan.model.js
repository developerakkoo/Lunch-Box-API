const mongoose = require("mongoose");

const weeklyAvailabilitySchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true },
    slots: [{ type: String }]
  },
  { _id: false }
);

const subscriptionPlanSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true
    },
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true
    },
    title: { type: String, required: true },
    description: String,
    planType: {
      type: String,
      enum: ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM", "CORPORATE"],
      default: "MONTHLY"
    },
    durationInDays: { type: Number, required: true },
    pricePerMeal: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    discountedPrice: Number,
    mealType: {
      type: String,
      enum: ["LUNCH", "DINNER", "BOTH", "BREAKFAST", "CUSTOM"],
      default: "LUNCH"
    },
    mealTypes: [{
      type: String,
      enum: ["BREAKFAST", "LUNCH", "DINNER", "CUSTOM"]
    }],
    mealsPerDay: { type: Number, default: 1, min: 1 },
    deliveryTimeSlots: [String],
    weeklyAvailability: [weeklyAvailabilitySchema],
    maxPauseDays: { type: Number, default: 30 },
    maxSkipCount: { type: Number, default: 10 },
    skipCutoffHours: { type: Number, default: 12 },
    cancellationPolicy: String,
    autoRenewAllowed: { type: Boolean, default: true },
    visibility: {
      type: String,
      enum: ["PUBLIC", "PRIVATE"],
      default: "PUBLIC"
    },
    images: [String],
    nutritionalInfo: String,
    tags: [String],
    isVeg: { type: Boolean, default: true },
    commissionOverridePercent: Number,
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

subscriptionPlanSchema.index({ partnerId: 1, isActive: 1 });
subscriptionPlanSchema.index({ partnerId: 1, visibility: 1 });
subscriptionPlanSchema.index(
  { partnerId: 1, menuItemId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true }
  }
);

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
