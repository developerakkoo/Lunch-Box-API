const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const partnerSchema = new mongoose.Schema(
  {
    kitchenName: {
      type: String,
      required: true
    },

    ownerName: {
      type: String,
      required: true
    },

    email: {
      type: String,
      required: true,
      unique: true
    },

    password: {
      type: String,
      required: true
    },

    phone: String,

    address: String,

    isActive: {
      type: Boolean,
      default: true
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE"
    }
  },
  { timestamps: true }
);


// 🔐 Hash Password Before Save
partnerSchema.pre("save", async function () {

  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 10);

});


// 🔐 Compare Password
partnerSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Partner", partnerSchema);
