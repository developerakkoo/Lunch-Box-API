const mongoose = require("mongoose");

const addonItemSchema = new mongoose.Schema({

  addonCategoryId: mongoose.Schema.Types.ObjectId,

  name: String,

  price: Number

});

module.exports = mongoose.model("AddonItem", addonItemSchema);
