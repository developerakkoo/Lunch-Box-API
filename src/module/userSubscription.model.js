const mongoose = require("mongoose");

const pausePeriodSchema = new mongoose.Schema(
  {
    start: { type: Date, required: true },
    end: Date,
    reason: String
  },
  { _id: false }
);

const addressSnapshotSchema = new mongoose.Schema(
  {
    addressId: mongoose.Schema.Types.ObjectId,
    fullAddress: String,
    latitude: Number,
    longitude: Number,
    label: String
  },
  { _id: false }
);

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
    corporateSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CorporateSubscription",
      default: null
    },
    title: { type: String, required: true },
    durationInDays: { type: Number, required: true },
    pricePerMeal: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "PENDING_PAYMENT",
        "ACTIVE",
        "PAUSED",
        "CANCELLED",
        "COMPLETED",
        "EXPIRED"
      ],
      default: "PENDING_PAYMENT"
    },
    deliveryAddress: addressSnapshotSchema,
    mealPreferences: mongoose.Schema.Types.Mixed,
    autoRenew: { type: Boolean, default: false },
    renewalAttempts: { type: Number, default: 0 },
    nextRenewalAt: Date,
    pausePeriods: [pausePeriodSchema],
    skippedMealCount: { type: Number, default: 0 },
    mealCredits: { type: Number, default: 0 },
    idempotencyKey: { type: String, sparse: true },
    payment: {
      method: {
        type: String,
        enum: ["WALLET", "ONLINE", "RAZORPAY", "STRIPE"],
        required: true
      },
      paymentStatus: {
        type: String,
        enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
        default: "PENDING"
      },
      gatewayOrderId: String,
      gatewayPaymentId: String,
      razorpayCustomerId: String
    },
    commissionPercent: Number,
    platformFeeAmount: Number,
    partnerNetAmount: Number
  },
  { timestamps: true }
);

userSubscriptionSchema.index({ userId: 1, createdAt: -1 });
userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ endDate: 1, status: 1 });
userSubscriptionSchema.index({ partnerId: 1, status: 1 });
userSubscriptionSchema.index({ corporateSubscriptionId: 1 });
userSubscriptionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

module.exports = mongoose.model("UserSubscription", userSubscriptionSchema);
