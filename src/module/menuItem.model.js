const mongoose = require('mongoose')
const { normalizeAssetValue } = require("../utils/media");

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      default: ''
    },

    price: {
      type: Number,
      required: true
    },
    discountPrice: {
      type: Number,
      default: 0,
      validate: {
        validator: function (value) {
          return value <= this.price
        },
        message: 'Discount price must be less than or equal to price'
      }
    },

    images: {
      type: [String],
      default: []
    },

    isVeg: {
      type: Boolean,
      default: true
    },

    isAvailable: {
      type: Boolean,
      default: true
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },

    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true
    }
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
  }
)

menuItemSchema.path("images").get(normalizeAssetValue)

module.exports = mongoose.model('MenuItem', menuItemSchema)
