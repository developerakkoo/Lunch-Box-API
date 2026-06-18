const mongoose = require("mongoose");

const supportMessageSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
      index: true
    },
    senderType: {
      type: String,
      enum: ["USER", "ADMIN", "SYSTEM"],
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    messageType: {
      type: String,
      enum: ["TEXT", "RATING_REQUEST", "RATING_SUBMITTED", "STATUS_UPDATE"],
      default: "TEXT"
    },
    body: {
      type: String,
      required: true
    },
    readByUser: {
      type: Boolean,
      default: false
    },
    readByAdmin: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

supportMessageSchema.index({ ticketId: 1, createdAt: -1 });

module.exports = mongoose.model("SupportMessage", supportMessageSchema);
