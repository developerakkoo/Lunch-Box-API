const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema({

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

  title: {
    type: String,
    required: true
  },

  description: String,

  durationInDays: {
    type: Number,
    required: true
  },

  pricePerMeal: {
    type: Number,
    required: true
  },

  totalPrice: {
    type: Number,
    required: true
  },

  mealType: {
    type: String,
    enum: ["LUNCH", "DINNER", "BOTH"],
    default: "LUNCH"
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });


subscriptionPlanSchema.index({ partnerId: 1 });

module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
