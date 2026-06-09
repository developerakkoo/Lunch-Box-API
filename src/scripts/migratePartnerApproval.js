require("dotenv").config();
const mongoose = require("mongoose");
const Partner = require("../module/partner.model");
const { PARTNER_APPROVAL_STATUS } = require("../utils/partnerApproval");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const result = await Partner.updateMany(
    { approvalStatus: { $exists: false } },
    {
      $set: {
        approvalStatus: PARTNER_APPROVAL_STATUS.APPROVED,
        reviewedAt: new Date()
      }
    }
  );

  console.log(`Partner approval migration complete. Matched=${result.matchedCount || result.n}, Modified=${result.modifiedCount || result.nModified}`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Partner approval migration failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
