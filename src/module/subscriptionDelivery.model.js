const mongoose = require("mongoose");

const subscriptionDeliverySchema = new mongoose.Schema({

  userSubscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserSubscription"
  },

  deliveryDate: {
    type: Date,
    required: true
  },

  status: {
    type: String,
    enum: [
      "PENDING",
      "DELIVERED",
      "SKIPPED",
      "CANCELLED"
    ],
    default: "PENDING"
  },

  deliveryBoyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "DeliveryBoy"
  }

}, { timestamps: true });

subscriptionDeliverySchema.index({ deliveryDate: 1 });

module.exports = mongoose.model("SubscriptionDelivery", subscriptionDeliverySchema);
