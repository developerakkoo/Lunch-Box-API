const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const partnerSchema = new mongoose.Schema(
  {
    ownerPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      default: null
    },

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
      required: function () {
        return !this.ownerPartner;
      },
      default: undefined
    },

    password: {
      type: String,
      required: function () {
        return !this.ownerPartner;
      },
      default: undefined
    },

    phone: String,

    address: String,

    latitude: Number,
    longitude: Number,

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

partnerSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" }
    }
  }
);


// 🔐 Hash Password Before Save
partnerSchema.pre("save", async function () {

  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 10);

});


// 🔐 Compare Password
partnerSchema.methods.comparePassword = async function (password) {
  if (!this.password) return false;
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Partner", partnerSchema);
