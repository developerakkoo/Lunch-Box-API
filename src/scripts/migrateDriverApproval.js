require("dotenv").config();
const mongoose = require("mongoose");
const DeliveryAgent = require("../module/Delivery_Agent");
const { DRIVER_ACCOUNT_STATUS } = require("../utils/driverApproval");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const result = await DeliveryAgent.updateMany(
    {
      $or: [
        { status: { $exists: false } },
        { status: null }
      ]
    },
    {
      $set: {
        status: DRIVER_ACCOUNT_STATUS.APPROVED,
        reviewedAt: new Date()
      }
    }
  );

  console.log(
    `Driver approval migration complete. Matched=${result.matchedCount || result.n}, Modified=${result.modifiedCount || result.nModified}`
  );
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Driver approval migration failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
