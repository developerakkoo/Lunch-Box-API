const mongoose = require("mongoose");

const addonItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },

    addonCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AddonCategory",
      required: true,
    },

    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AddonItem", addonItemSchema);
