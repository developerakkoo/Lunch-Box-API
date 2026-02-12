const mongoose = require("mongoose");

const addonCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    isRequired: {
      type: Boolean,
      default: false,
    },

    maxSelection: {
      type: Number,
      default: 1,
    },

    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
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

module.exports = mongoose.model("AddonCategory", addonCategorySchema);
