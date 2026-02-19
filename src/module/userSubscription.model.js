const mongoose = require("mongoose");

const userSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
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
    subscriptionPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true
    },
    title: {
      type: String,
      required: true
    },
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
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ["PENDING_PAYMENT", "ACTIVE", "PAUSED", "CANCELLED", "COMPLETED"],
      default: "PENDING_PAYMENT"
    },
    payment: {
      method: {
        type: String,
        enum: ["WALLET", "RAZORPAY", "STRIPE"],
        required: true
      },
      paymentStatus: {
        type: String,
        enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
        default: "PENDING"
      },
      gatewayOrderId: String,
      gatewayPaymentId: String
    }
  },
  { timestamps: true }
);

userSubscriptionSchema.index({ userId: 1, createdAt: -1 });
userSubscriptionSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("UserSubscription", userSubscriptionSchema);
