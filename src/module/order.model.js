const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({

  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Partner"
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  orderItems: [
    {
      menuItemId: mongoose.Schema.Types.ObjectId,
      quantity: Number,
      price: Number,
      addons: [
        {
          addonItemId: mongoose.Schema.Types.ObjectId,
          price: Number
        }
      ]
    }
  ],

  totalAmount: Number,

  paymentMethod: {
    type: String,
    enum: ["ONLINE", "COD", "WALLET"]
  },

  paymentStatus: {
    type: String,
    enum: ["PENDING", "PAID", "FAILED"],
    default: "PENDING"
  },

  orderStatus: {
    type: String,
    enum: [
      "NEW",
      "ACCEPTED",
      "PROCESSING",
      "ON_ROUTE",
      "DELIVERED",
      "CANCELLED"
    ],
    default: "NEW"
  },

  deliveryBoyId: mongoose.Schema.Types.ObjectId,

  deliveryAddress: Object

}, { timestamps: true });


orderSchema.index({ partnerId: 1, orderStatus: 1 });

module.exports = mongoose.model("Order", orderSchema);
