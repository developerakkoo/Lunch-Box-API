require("dotenv").config();
const mongoose = require("mongoose");
const { backfillPartnerRatings } = require("../services/orderRating.service");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await backfillPartnerRatings();
  console.log(
    `Rating backfill complete. Partners=${result.partners}, DeliveryAgents=${result.agents}`
  );
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Rating backfill failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // Already disconnected.
  }
  process.exit(1);
});
