const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },

  description: String,

  discountType: {
    type: String,
    enum: ["PERCENTAGE", "FLAT"],
    required: true
  },

  discountValue: {
    type: Number,
    required: true
  },

  minOrderAmount: {
    type: Number,
    default: 0
  },

  maxDiscountAmount: {
    type: Number
  },

  usageLimit: {
    type: Number,
    default: 1
  },

  usedCount: {
    type: Number,
    default: 0
  },

  validFrom: Date,
  validTill: Date,

  applicableKitchens: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner"
    }
  ],

  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Coupon", couponSchema);
