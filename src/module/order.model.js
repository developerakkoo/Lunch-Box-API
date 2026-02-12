const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | USER & PARTNER
    |--------------------------------------------------------------------------
    */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      required: true,
    },

    deliveryAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryAgent",
      default: null,
    },



    /*
    |--------------------------------------------------------------------------
    | ORDER ITEMS SNAPSHOT
    |--------------------------------------------------------------------------
    */
    items: [
      {
        menuItem: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MenuItem",
        },

        name: String, // snapshot
        price: Number, // snapshot

        quantity: Number,

        addons: [
          {
            addonItem: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "AddonItem",
            },

            name: String,
            price: Number,
          },
        ],
      },
    ],



    /*
    |--------------------------------------------------------------------------
    | PRICE BREAKDOWN
    |--------------------------------------------------------------------------
    */
    priceDetails: {
      itemTotal: Number,
      tax: Number,
      deliveryCharge: Number,
      platformFee: Number,
      discount: Number,
      totalAmount: Number,
    },



    /*
    |--------------------------------------------------------------------------
    | DELIVERY ADDRESS SNAPSHOT
    |--------------------------------------------------------------------------
    */
    deliveryAddress: {
      fullAddress: String,
      latitude: Number,
      longitude: Number,
    },



    /*
    |--------------------------------------------------------------------------
    | PAYMENT DETAILS
    |--------------------------------------------------------------------------
    */
    payment: {
      method: {
        type: String,
        enum: ["COD", "ONLINE", "WALLET"],
        default: "COD",
      },

      paymentStatus: {
        type: String,
        enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
        default: "PENDING",
      },

      transactionId: String,
    },



    /*
    |--------------------------------------------------------------------------
    | ORDER STATUS
    |--------------------------------------------------------------------------
    */
    status: {
      type: String,
      enum: [
        "PLACED",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED",
      ],
      default: "PLACED",
    },



    /*
    |--------------------------------------------------------------------------
    | STATUS TIMELINE 
    |--------------------------------------------------------------------------
    */
    timeline: {
      placedAt: Date,
      acceptedAt: Date,
      preparingAt: Date,
      readyAt: Date,
      pickedAt: Date,
      deliveredAt: Date,
      cancelledAt: Date,
    },



    /*
    |--------------------------------------------------------------------------
    | CANCELLATION INFO
    |--------------------------------------------------------------------------
    */
    cancellation: {
      cancelledBy: {
        type: String,
        enum: ["USER", "PARTNER", "SYSTEM"],
      },
      reason: String,
    },



    /*
    |--------------------------------------------------------------------------
    | RATING SYSTEM
    |--------------------------------------------------------------------------
    */
    rating: {
      userRating: Number,
      partnerRating: Number,
      deliveryRating: Number,
      review: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
