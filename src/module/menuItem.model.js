const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({

  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Partner",
    required: true
  },

  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category"
  },

  name: {
    type: String,
    required: true
  },

  description: String,

  price: {
    type: Number,
    required: true
  },

  images: [String],

  isVeg: Boolean,

  isAvailable: {
    type: Boolean,
    default: true
  },

  hasSubscription: {
    type: Boolean,
    default: false
  }

}, { timestamps: true });

module.exports = mongoose.model("MenuItem", menuItemSchema);
