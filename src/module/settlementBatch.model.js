const mongoose = require("mongoose");

const settlementBatchSchema = new mongoose.Schema(
  {
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true
    },
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING"
    },
    totalAmount: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    bankReference: String,
    failureReason: String,
    ledgerEntryIds: [mongoose.Schema.Types.ObjectId],
    processedAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

settlementBatchSchema.index({ partnerId: 1, weekStart: -1 });
settlementBatchSchema.index({ status: 1 });

module.exports = mongoose.model("SettlementBatch", settlementBatchSchema);
