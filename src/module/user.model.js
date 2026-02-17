const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  label: {
    type: String, // Home, Office
  },
  fullAddress: {
    type: String,
    required: true
  },
  city: String,
  state: String,
  pincode: String,
  latitude: Number,
  longitude: Number,
  isDefault: {
    type: Boolean,
    default: false
  }
}, { _id: true });

const userSchema = new mongoose.Schema(
  {
    countryCode: {
      type: String,
      default: "+91"
    },

    mobileNumber: {
      type: String,
      required: true,
      unique: true
    },

    fullName: String,
    email: String,

    // 🔥 Multiple addresses support
    addresses: [addressSchema],

    // 🔥 Wallet system
    walletBalance: {
      type: Number,
      default: 0
    },

    // 🔥 Referral
    referralCode: String,
    referredBy: String,

    isRegistered: {
      type: Boolean,
      default: false
    },

    refreshToken: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
