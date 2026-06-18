const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    score: { type: Number, min: 1, max: 5 },
    comment: String,
    submittedAt: Date
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    category: {
      type: String,
      enum: ["ORDER", "PAYMENT", "DELIVERY", "ACCOUNT", "OTHER"],
      default: "OTHER"
    },
    status: {
      type: String,
      enum: ["OPEN", "ACTIVE", "PENDING_RATING", "RESOLVED", "CLOSED"],
      default: "OPEN",
      index: true
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    lastMessagePreview: {
      type: String,
      default: ""
    },
    unreadByUser: {
      type: Number,
      default: 0
    },
    unreadByAdmin: {
      type: Number,
      default: 0
    },
    rating: ratingSchema,
    ratingRequestedAt: Date,
    resolvedAt: Date,
    resolvedBy: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: null
    }
  },
  { timestamps: true }
);

supportTicketSchema.index({ userId: 1, status: 1, lastMessageAt: -1 });
supportTicketSchema.index({ status: 1, lastMessageAt: -1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
