const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const deliveryAgentSchema = new mongoose.Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | AUTH / ACCOUNT
    |--------------------------------------------------------------------------
    */
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    mobileNumber: {
      type: String,
      required: true,
    },

    address: {
      type: String,
      required: true,
    },



    /*
    |--------------------------------------------------------------------------
    | OPTIONAL USER LINK
    |--------------------------------------------------------------------------
    */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },



    /*
    |--------------------------------------------------------------------------
    | BASIC PROFILE
    |--------------------------------------------------------------------------
    */
    fullName: {
      type: String,
      required: true,
    },

    profileImage: String,



    /*
    |--------------------------------------------------------------------------
    | VEHICLE DETAILS (NOT REQUIRED DURING REGISTER)
    |--------------------------------------------------------------------------
    */
    vehicle: {
      type: {
        type: String,
        enum: ["BIKE", "SCOOTER", "BICYCLE", "CAR"],
      },
      vehicleNumber: String,
      model: String,
      color: String,
    },



    /*
    |--------------------------------------------------------------------------
    | KYC / DOCUMENT VERIFICATION
    |--------------------------------------------------------------------------
    */
    documents: {
      licenseNumber: String,
      licenseImage: String,
      aadhaarNumber: String,
      aadhaarImage: String,
      panNumber: String,
      panImage: String,
    },



    /*
    |--------------------------------------------------------------------------
    | PROFILE COMPLETION TRACKER
    |--------------------------------------------------------------------------
    */
    profileCompleted: {
      type: Boolean,
      default: false,
    },



    /*
    |--------------------------------------------------------------------------
    | LIVE STATUS
    |--------------------------------------------------------------------------
    */
    isOnline: {
      type: Boolean,
      default: false,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },

    currentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },



    /*
    |--------------------------------------------------------------------------
    | LIVE LOCATION TRACKING
    |--------------------------------------------------------------------------
    */
    liveLocation: {
      latitude: Number,
      longitude: Number,
      updatedAt: Date,
    },



    /*
    |--------------------------------------------------------------------------
    | RATING & PERFORMANCE
    |--------------------------------------------------------------------------
    */
    rating: {
      averageRating: {
        type: Number,
        default: 0,
      },
      totalRatings: {
        type: Number,
        default: 0,
      },
    },



    /*
    |--------------------------------------------------------------------------
    | EARNINGS TRACKING
    |--------------------------------------------------------------------------
    */
    earnings: {
      today: { type: Number, default: 0 },
      weekly: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },



    /*
    |--------------------------------------------------------------------------
    | SHIFT / DUTY TRACKING
    |--------------------------------------------------------------------------
    */
    shift: {
      startedAt: Date,
      endedAt: Date,
    },



    /*
    |--------------------------------------------------------------------------
    | ACCOUNT STATUS
    |--------------------------------------------------------------------------
    */
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "BLOCKED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);



/*
|--------------------------------------------------------------------------
| PASSWORD HASH MIDDLEWARE
|--------------------------------------------------------------------------
*/
// deliveryAgentSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();

//   this.password = await bcrypt.hash(this.password, 10);
//   next();
// });



/*
|--------------------------------------------------------------------------
| PASSWORD COMPARE METHOD
|--------------------------------------------------------------------------
*/
deliveryAgentSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};



module.exports = mongoose.model("DeliveryAgent", deliveryAgentSchema);
