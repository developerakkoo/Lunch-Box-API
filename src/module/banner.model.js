const mongoose = require("mongoose");
const { normalizeAssetValue } = require("../utils/media");

const bannerSchema = new mongoose.Schema({
  title: String,
  image: {
    type: String,
    get: normalizeAssetValue
  },
  redirectLink: String,
  isActive: { type: Boolean, default: true }
},
{
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

module.exports = mongoose.model("Banner", bannerSchema);
