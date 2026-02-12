const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema({
  title: String,
  image: String,
  redirectLink: String,
  isActive: { type: Boolean, default: true }
},
{ timestamps: true });

module.exports = mongoose.model("Banner", bannerSchema);
