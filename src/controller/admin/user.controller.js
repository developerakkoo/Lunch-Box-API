const mongoose = require("mongoose");
const User = require("../../module/user.model");
const Order = require("../../module/order.model");
const UserSubscription = require("../../module/userSubscription.model");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

async function enrichUserRow(user) {
  const userId = user._id;
  const [orderCount, hasSubscription] = await Promise.all([
    Order.countDocuments({ user: userId }),
    UserSubscription.exists({ userId, status: "ACTIVE" }),
  ]);
  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    mobileNumber: user.mobileNumber,
    countryCode: user.countryCode,
    walletBalance: user.walletBalance,
    isBlocked: user.isBlocked,
    createdAt: user.createdAt,
    orderCount,
    hasSubscription: Boolean(hasSubscription),
  };
}

exports.getUsers = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 20, status } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);
    const query = {};

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { mobileNumber: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (status === "blocked") {
      query.isBlocked = true;
    } else if (status === "active") {
      query.isBlocked = { $ne: true };
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("fullName email mobileNumber countryCode walletBalance isBlocked createdAt")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      User.countDocuments(query),
    ]);

    const data = await Promise.all(users.map((u) => enrichUserRow(u)));

    return res.status(200).json({
      message: "Users fetched successfully",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findById(id).select("-refreshToken");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [orderCount, subscriptionCount, activeSubscription] = await Promise.all([
      Order.countDocuments({ user: id }),
      UserSubscription.countDocuments({ userId: id }),
      UserSubscription.exists({ userId: id, status: "ACTIVE" }),
    ]);

    return res.status(200).json({
      message: "User fetched successfully",
      data: {
        user,
        stats: {
          orderCount,
          subscriptionCount,
          activeSubscription: Boolean(activeSubscription),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.setUserBlocked = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { isBlocked: Boolean(isBlocked) },
      { new: true }
    ).select("-refreshToken");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: isBlocked ? "User blocked" : "User unblocked",
      data: user,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
