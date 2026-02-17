const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  kitchenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Partner", // your kitchen owner model
    required: true
  },
  name: String,
  price: Number,
  quantity: {
    type: Number,
    default: 1
  },
  addOns: [
    {
      name: String,
      price: Number
    }
  ],
  totalItemPrice: Number
});

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  kitchenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Partner"
  },
  items: [cartItemSchema],
  totalAmount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

module.exports = mongoose.model("Cart", cartSchema);
