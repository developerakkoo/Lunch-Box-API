const mongoose = require("mongoose");
const Partner = require("../module/partner.model");
const PlatformSettings = require("../module/platformSettings.model");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await Partner.syncIndexes();
    await PlatformSettings.findOneAndUpdate(
      { key: "default" },
      { $setOnInsert: { key: "default" } },
      { upsert: true }
    );
    console.log("MongoDB Connected");
    console.log("Partner indexes synced");
  } catch (error) {
    console.error("MongoDB Error", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
