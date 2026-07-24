const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { PARTNER_APPROVAL_STATUS } = require("../utils/partnerApproval");
const { normalizeAssetValue } = require("../utils/media");

const partnerSchema = new mongoose.Schema(
  {
    ownerPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      default: null
    },

    kitchenName: {
      type: String,
      required: true
    },

    ownerName: {
      type: String,
      required: true
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      required: function () {
        return !this.ownerPartner;
      },
      default: undefined
    },

    password: {
      type: String,
      required: function () {
        return !this.ownerPartner;
      },
      default: undefined
    },

    approvalStatus: {
      type: String,
      enum: Object.values(PARTNER_APPROVAL_STATUS),
      default: PARTNER_APPROVAL_STATUS.PENDING,
      index: true
    },

    rejectionReason: {
      type: String,
      default: ""
    },

    reviewedAt: {
      type: Date,
      default: null
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null
    },

    gstApplicable: {
      type: Boolean,
      default: false
    },

    selfDelivery: {
      type: Boolean,
      default: false
    },

    documents: {
      panCard: {
        url: { type: String, default: "" },
        originalName: { type: String, default: "" },
        mimeType: { type: String, default: "" },
        size: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: null }
      },
      gstCertificate: {
        url: { type: String, default: "" },
        originalName: { type: String, default: "" },
        mimeType: { type: String, default: "" },
        size: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: null }
      },
      fssaiLicense: {
        url: { type: String, default: "" },
        originalName: { type: String, default: "" },
        mimeType: { type: String, default: "" },
        size: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: null }
      }
    },

    /** Kitchen / storefront photos (relative upload paths). */
    images: {
      type: [String],
      default: [],
      validate: {
        validator(v) {
          return !v || v.length <= 5;
        },
        message: "A kitchen can have at most 5 photos"
      }
    },

    phone: String,

    address: String,

    latitude: Number,
    longitude: Number,

    isActive: {
      type: Boolean,
      default: true
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE"
    },

    walletBalance: {
      type: Number,
      default: 0
    },

    subscriptionCommissionPercent: Number,

    /** Payout bank account on the owner partner record. */
    bankAccount: {
      beneficiaryName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      ifsc: { type: String, default: "" },
      bankName: { type: String, default: "" },
      accountType: {
        type: String,
        enum: ["SAVINGS", "CURRENT", ""],
        default: ""
      },
      updatedAt: { type: Date, default: null }
    }
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
  }
);

partnerSchema.path("images").get(normalizeAssetValue);

partnerSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" }
    }
  }
);

partnerSchema.index({ approvalStatus: 1, createdAt: -1 });


// 🔐 Hash Password Before Save
partnerSchema.pre("save", async function () {

  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 10);

});


// 🔐 Compare Password
partnerSchema.methods.comparePassword = async function (password) {
  if (!this.password) return false;
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Partner", partnerSchema);
