const mongoose = require("mongoose");

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
    address: String,

    isRegistered: {
      type: Boolean,
      default: false
    },

    refreshToken: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
