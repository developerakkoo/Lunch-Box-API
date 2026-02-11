const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({

  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Partner",
    required: true
  },

  name: {
    type: String,
    required: true
  },

  image: String,

  isActive: {
    type: Boolean,
    default: true
  },

  sortOrder: {
    type: Number,
    default: 0
  }

}, { timestamps: true });


categorySchema.index({ partnerId: 1 });

module.exports = mongoose.model("Category", categorySchema);
