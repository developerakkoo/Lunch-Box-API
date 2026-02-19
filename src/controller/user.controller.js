const User = require("../module/user.model");
const Partner = require("../module/partner.model");
const Category = require("../module/category.model");
const MenuItem = require("../module/menuItem.model");
const WalletTransaction = require("../module/walletTransaction.model");
const { createOrder: createRazorpayOrder, verifySignature } = require("../utils/razorpay");
const { createPaymentIntent, retrievePaymentIntent } = require("../utils/stripe");
const {
  generateAccessToken,
  generateRefreshToken
} = require("../utils/token.utils");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");

const REFERRAL_REWARD_REFERRER = 50;
const REFERRAL_REWARD_NEW_USER = 25;

const generateReferralCode = async (fullName = "USER") => {
  const base = fullName.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "USER";
  for (let i = 0; i < 10; i += 1) {
    const code = `${base}${randomBytes(2).toString("hex").toUpperCase()}`;
    const exists = await User.findOne({ referralCode: code }).select("_id");
    if (!exists) return code;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
};

const createWalletLedgerEntry = async ({
  userId,
  type,
  source,
  amount,
  balanceBefore,
  balanceAfter,
  status = "SUCCESS",
  gateway = "SYSTEM",
  externalTxnId,
  referenceType,
  referenceId,
  notes
}) => {
  return WalletTransaction.create({
    userId,
    type,
    source,
    amount,
    balanceBefore,
    balanceAfter,
    status,
    gateway,
    externalTxnId,
    referenceType,
    referenceId,
    notes
  });
};


/* ================= LOGIN / REGISTER USER ================= */

exports.loginUser = async (req, res) => {
  try {

    const { countryCode, mobileNumber, fullName, email, referralCode } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({
        statusCode: 400,
        message: "Mobile number is required"
      });
    }

    let user = await User.findOne({ mobileNumber });

    /* ===== NEW USER ===== */

    if (!user) {

      if (!fullName || !email) {
        return res.status(400).json({
          statusCode: 400,
          message: "Full name and email required for new user"
        });
      }

      let referredBy = null;
      let referrer = null;

      if (referralCode) {
        referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
        if (!referrer) {
          return res.status(400).json({
            statusCode: 400,
            message: "Invalid referral code"
          });
        }
        referredBy = referrer.referralCode;
      }

      user = await User.create({
        countryCode: countryCode || "+91",
        mobileNumber,
        fullName,
        email,
        referralCode: await generateReferralCode(fullName),
        referredBy,
        isRegistered: true
      });

      if (referrer) {
        const referrerBefore = referrer.walletBalance || 0;
        referrer.walletBalance = referrerBefore + REFERRAL_REWARD_REFERRER;
        referrer.referralEarnings = (referrer.referralEarnings || 0) + REFERRAL_REWARD_REFERRER;
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        await referrer.save();

        await createWalletLedgerEntry({
          userId: referrer._id,
          type: "CREDIT",
          source: "REFERRAL_BONUS",
          amount: REFERRAL_REWARD_REFERRER,
          balanceBefore: referrerBefore,
          balanceAfter: referrer.walletBalance,
          gateway: "SYSTEM",
          referenceType: "User",
          referenceId: user._id,
          notes: `Referral bonus for inviting ${user.mobileNumber}`
        });

        const newUserBefore = user.walletBalance || 0;
        user.walletBalance = newUserBefore + REFERRAL_REWARD_NEW_USER;
        await user.save();

        await createWalletLedgerEntry({
          userId: user._id,
          type: "CREDIT",
          source: "REFERRAL_BONUS",
          amount: REFERRAL_REWARD_NEW_USER,
          balanceBefore: newUserBefore,
          balanceAfter: user.walletBalance,
          gateway: "SYSTEM",
          referenceType: "User",
          referenceId: referrer._id,
          notes: "Referral signup bonus"
        });
      }

      console.log("New user created:", user._id);
    }

    if (!user.referralCode) {
      user.referralCode = await generateReferralCode(user.fullName);
    }

    /* ===== GENERATE TOKENS ===== */

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    return res.status(user.isNew ? 201 : 200).json({
      statusCode: 200,
      message: "Login successful",
      data: {
        userId: user._id,
        accessToken,
        refreshToken,
        user
      }
    });

  } catch (error) {
    console.log("🔥 Login Error:", error.message);

    res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

/* ================= ADD ADDRESS ================= */

exports.addAddress = async (req, res) => {
  try {

    const userId = req.user.id;   // from auth middleware

    const {
      label,
      fullAddress,
      city,
      state,
      pincode,
      latitude,
      longitude,
      isDefault
    } = req.body;

    if (!fullAddress) {
      return res.status(400).json({
        statusCode: 400,
        message: "Full address is required"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "User not found"
      });
    }

    // 🔥 If new address is default → make others false
    if (isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    user.addresses.push({
      label,
      fullAddress,
      city,
      state,
      pincode,
      latitude,
      longitude,
      isDefault: isDefault || false
    });

    await user.save();

    console.log("🏠 Address added for user:", userId);

    res.status(201).json({
      statusCode: 201,
      message: "Address added successfully",
      data: user.addresses
    });

  } catch (error) {

    console.log("🔥 Add Address Error:", error.message);

    res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("addresses");

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "User not found"
      });
    }

    return res.status(200).json({
      statusCode: 200,
      message: "Addresses fetched successfully",
      data: user.addresses
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const updates = req.body || {};

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "User not found"
      });
    }

    const address = user.addresses.id(addressId);

    if (!address) {
      return res.status(404).json({
        statusCode: 404,
        message: "Address not found"
      });
    }

    const fields = [
      "label",
      "fullAddress",
      "city",
      "state",
      "pincode",
      "latitude",
      "longitude"
    ];

    fields.forEach((field) => {
      if (updates[field] !== undefined) {
        address[field] = updates[field];
      }
    });

    if (updates.isDefault === true) {
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
      address.isDefault = true;
    } else if (updates.isDefault === false) {
      address.isDefault = false;
    }

    await user.save();

    return res.status(200).json({
      statusCode: 200,
      message: "Address updated successfully",
      data: user.addresses
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "User not found"
      });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({
        statusCode: 404,
        message: "Address not found"
      });
    }

    const wasDefault = Boolean(address.isDefault);
    address.deleteOne();

    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    return res.status(200).json({
      statusCode: 200,
      message: "Address deleted successfully",
      data: user.addresses
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        message: "User not found"
      });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({
        statusCode: 404,
        message: "Address not found"
      });
    }

    user.addresses.forEach((addr) => {
      addr.isDefault = addr._id.toString() === addressId;
    });

    await user.save();

    return res.status(200).json({
      statusCode: 200,
      message: "Default address updated successfully",
      data: user.addresses
    });
  } catch (error) {
    return res.status(500).json({
      statusCode: 500,
      message: error.message
    });
  }
};

const toRad = (value) => (value * Math.PI) / 180;

const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

exports.getNearbyKitchens = async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      radiusKm = 10,
      search = "",
      page = 1,
      limit = 20
    } = req.query;

    const filter = {
      isActive: true,
      status: "ACTIVE"
    };

    if (search) {
      filter.kitchenName = { $regex: search, $options: "i" };
    }

    const kitchens = await Partner.find(filter)
      .select("kitchenName ownerName address latitude longitude isActive status createdAt")
      .lean();

    const hasClientLocation =
      latitude !== undefined &&
      longitude !== undefined &&
      !Number.isNaN(Number(latitude)) &&
      !Number.isNaN(Number(longitude));

    let mapped = kitchens.map((kitchen) => {
      if (!hasClientLocation || kitchen.latitude === undefined || kitchen.longitude === undefined) {
        return {
          ...kitchen,
          distanceKm: null
        };
      }

      const distanceKm = haversineDistanceKm(
        Number(latitude),
        Number(longitude),
        Number(kitchen.latitude),
        Number(kitchen.longitude)
      );

      return {
        ...kitchen,
        distanceKm: Number(distanceKm.toFixed(2))
      };
    });

    if (hasClientLocation) {
      mapped = mapped.filter(
        (kitchen) => kitchen.distanceKm === null || kitchen.distanceKm <= Number(radiusKm)
      );

      mapped.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    } else {
      mapped.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);
    const startIndex = (pageNumber - 1) * limitNumber;
    const paginated = mapped.slice(startIndex, startIndex + limitNumber);

    return res.json({
      message: "Nearby kitchens fetched successfully",
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total: mapped.length
      },
      data: paginated
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getKitchenMenuForCustomer = async (req, res) => {
  try {
    const { kitchenId } = req.params;

    const kitchen = await Partner.findOne({
      _id: kitchenId,
      isActive: true,
      status: "ACTIVE"
    }).select("kitchenName ownerName address latitude longitude");

    if (!kitchen) {
      return res.status(404).json({ message: "Kitchen not found" });
    }

    const categories = await Category.find({ partner: kitchenId })
      .select("name description image")
      .sort({ createdAt: -1 })
      .lean();

    const items = await MenuItem.find({
      partner: kitchenId,
      isAvailable: true
    })
      .populate("category", "name")
      .select("name description price image isVeg isAvailable category")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      message: "Kitchen menu fetched successfully",
      data: {
        kitchen,
        categories,
        items
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getMenuItemDetailsForCustomer = async (req, res) => {
  try {
    const { menuItemId } = req.params;

    const menuItem = await MenuItem.findById(menuItemId)
      .populate("category", "name description")
      .populate("partner", "kitchenName ownerName address latitude longitude isActive status");

    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    if (!menuItem.isAvailable || !menuItem.partner?.isActive || menuItem.partner?.status !== "ACTIVE") {
      return res.status(400).json({ message: "Menu item is currently unavailable" });
    }

    return res.json({
      message: "Menu item details fetched successfully",
      data: menuItem
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= WALLET ================= */

exports.getWalletSummary = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("walletBalance");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      message: "Wallet summary fetched successfully",
      data: {
        walletBalance: user.walletBalance || 0
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getWalletTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      WalletTransaction.countDocuments({ userId: req.user.id })
    ]);

    return res.status(200).json({
      message: "Wallet transactions fetched successfully",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data: transactions
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createWalletTopup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, gateway = "RAZORPAY" } = req.body;
    const topupAmount = Number(amount);

    if (!topupAmount || topupAmount <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const before = user.walletBalance || 0;
    const pendingPayload = {
      userId,
      type: "CREDIT",
      source: "TOPUP",
      amount: topupAmount,
      balanceBefore: before,
      balanceAfter: before,
      status: "PENDING",
      referenceType: "User",
      referenceId: userId,
      notes: "Wallet topup initiated"
    };

    if (gateway === "RAZORPAY") {
      const razorpayOrder = await createRazorpayOrder(Math.round(topupAmount * 100));
      const tx = await createWalletLedgerEntry({
        ...pendingPayload,
        gateway: "RAZORPAY",
        externalTxnId: razorpayOrder.id
      });
      return res.status(200).json({
        message: "Wallet topup order created",
        transactionId: tx._id,
        gateway: "RAZORPAY",
        razorpayOrder
      });
    }

    if (gateway === "STRIPE") {
      const paymentIntent = await createPaymentIntent({
        amount: Math.round(topupAmount * 100),
        currency: "inr",
        metadata: {
          userId: String(userId),
          type: "WALLET_TOPUP"
        }
      });
      const tx = await createWalletLedgerEntry({
        ...pendingPayload,
        gateway: "STRIPE",
        externalTxnId: paymentIntent.id
      });

      return res.status(200).json({
        message: "Wallet topup payment intent created",
        transactionId: tx._id,
        gateway: "STRIPE",
        stripePaymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency
        }
      });
    }

    return res.status(400).json({ message: "Invalid gateway. Use RAZORPAY or STRIPE" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.confirmWalletTopup = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      gateway,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      stripe_payment_intent_id
    } = req.body;

    let tx;
    let amount = 0;

    if (gateway === "RAZORPAY") {
      const valid = verifySignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });
      if (!valid) return res.status(400).json({ message: "Invalid Razorpay signature" });

      tx = await WalletTransaction.findOne({
        userId,
        source: "TOPUP",
        gateway: "RAZORPAY",
        externalTxnId: razorpay_order_id
      });
      if (!tx) return res.status(404).json({ message: "Pending topup transaction not found" });
      amount = tx.amount;
      tx.notes = "Wallet topup confirmed via Razorpay";
    } else if (gateway === "STRIPE") {
      const paymentIntent = await retrievePaymentIntent(stripe_payment_intent_id);
      if (!paymentIntent || paymentIntent.status !== "succeeded") {
        return res.status(400).json({ message: "Stripe payment not successful" });
      }

      tx = await WalletTransaction.findOne({
        userId,
        source: "TOPUP",
        gateway: "STRIPE",
        externalTxnId: stripe_payment_intent_id
      });
      if (!tx) return res.status(404).json({ message: "Pending topup transaction not found" });
      amount = tx.amount;
      tx.notes = "Wallet topup confirmed via Stripe";
    } else {
      return res.status(400).json({ message: "Invalid gateway" });
    }

    if (tx.status === "SUCCESS") {
      const userExisting = await User.findById(userId).select("walletBalance");
      return res.status(200).json({
        message: "Wallet topup already confirmed",
        data: {
          walletBalance: userExisting?.walletBalance || 0
        }
      });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const before = user.walletBalance || 0;
    user.walletBalance = before + amount;
    await user.save();

    tx.status = "SUCCESS";
    tx.balanceBefore = before;
    tx.balanceAfter = user.walletBalance;
    await tx.save();

    return res.status(200).json({
      message: "Wallet topup confirmed successfully",
      data: {
        walletBalance: user.walletBalance,
        transaction: tx
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= REFERRAL ================= */

exports.getReferralInfo = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "referralCode referralEarnings referralCount walletBalance"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.referralCode) {
      user.referralCode = await generateReferralCode(user.fullName);
      await user.save();
    }

    return res.status(200).json({
      message: "Referral info fetched successfully",
      data: {
        referralCode: user.referralCode,
        referralEarnings: user.referralEarnings || 0,
        referralCount: user.referralCount || 0,
        rewardRules: {
          referrerReward: REFERRAL_REWARD_REFERRER,
          newUserReward: REFERRAL_REWARD_NEW_USER
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.applyReferralCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { referralCode } = req.body;
    if (!referralCode) {
      return res.status(400).json({ message: "referralCode is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.referredBy) {
      return res.status(400).json({ message: "Referral code already applied" });
    }

    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
    if (!referrer) return res.status(400).json({ message: "Invalid referral code" });
    if (String(referrer._id) === String(user._id)) {
      return res.status(400).json({ message: "You cannot apply your own referral code" });
    }

    user.referredBy = referrer.referralCode;
    const userBefore = user.walletBalance || 0;
    user.walletBalance = userBefore + REFERRAL_REWARD_NEW_USER;
    await user.save();

    const referrerBefore = referrer.walletBalance || 0;
    referrer.walletBalance = referrerBefore + REFERRAL_REWARD_REFERRER;
    referrer.referralEarnings = (referrer.referralEarnings || 0) + REFERRAL_REWARD_REFERRER;
    referrer.referralCount = (referrer.referralCount || 0) + 1;
    await referrer.save();

    await createWalletLedgerEntry({
      userId: user._id,
      type: "CREDIT",
      source: "REFERRAL_BONUS",
      amount: REFERRAL_REWARD_NEW_USER,
      balanceBefore: userBefore,
      balanceAfter: user.walletBalance,
      referenceType: "User",
      referenceId: referrer._id,
      notes: "Referral code applied"
    });

    await createWalletLedgerEntry({
      userId: referrer._id,
      type: "CREDIT",
      source: "REFERRAL_BONUS",
      amount: REFERRAL_REWARD_REFERRER,
      balanceBefore: referrerBefore,
      balanceAfter: referrer.walletBalance,
      referenceType: "User",
      referenceId: user._id,
      notes: `Referral reward for ${user.mobileNumber}`
    });

    return res.status(200).json({
      message: "Referral code applied successfully",
      data: {
        walletBalance: user.walletBalance
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/* ================= FAVORITES ================= */

exports.addFavoriteKitchen = async (req, res) => {
  try {
    const { kitchenId } = req.params;
    const kitchen = await Partner.findOne({ _id: kitchenId, isActive: true, status: "ACTIVE" });
    if (!kitchen) return res.status(404).json({ message: "Kitchen not found" });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { favoriteKitchens: kitchenId } },
      { new: true }
    ).populate("favoriteKitchens", "kitchenName address isActive status");

    return res.status(200).json({
      message: "Kitchen added to favorites",
      data: user.favoriteKitchens
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.removeFavoriteKitchen = async (req, res) => {
  try {
    const { kitchenId } = req.params;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { favoriteKitchens: kitchenId } },
      { new: true }
    ).populate("favoriteKitchens", "kitchenName address isActive status");

    return res.status(200).json({
      message: "Kitchen removed from favorites",
      data: user.favoriteKitchens
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getFavoriteKitchens = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate(
      "favoriteKitchens",
      "kitchenName address latitude longitude isActive status"
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      message: "Favorite kitchens fetched successfully",
      data: user.favoriteKitchens || []
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};




/* ================= PROFILE ================= */

exports.getProfile = async (req, res) => {

  const user = await User.findById(req.user.id);

  res.json({
    statusCode: 200,
    data: user
  });
};



/* ================= REFRESH TOKEN ================= */

exports.refreshAccessToken = async (req, res) => {

  try {

    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token required"
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_SECRET
    );

    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        message: "Invalid refresh token"
      });
    }

    const accessToken = generateAccessToken(user);

    res.json({
      statusCode: 200,
      message: "Access token refreshed",
      data: { accessToken }
    });

  } catch (error) {
    res.status(401).json({
      message: "Refresh token expired"
    });
  }
};
