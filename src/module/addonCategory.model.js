const mongoose = require("mongoose");

const addonCategorySchema = new mongoose.Schema({

  partnerId: mongoose.Schema.Types.ObjectId,

  name: String,

  minSelection: Number,
  maxSelection: Number

});

module.exports = mongoose.model("AddonCategory", addonCategorySchema);
