const mongoose = require("mongoose");
const User = require("../../module/user.model");
const Partner = require("../../module/partner.model");
const UserSubscription = require("../../module/userSubscription.model");
const SubscriptionDelivery = require("../../module/subscriptionDelivery.model");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

exports.getSubscriptionStats = async (req, res) => {
  try {
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [active, expiring, revenueAgg] = await Promise.all([
      UserSubscription.countDocuments({ status: "ACTIVE" }),
      UserSubscription.countDocuments({
        status: "ACTIVE",
        endDate: { $gte: now, $lte: inSevenDays }
      }),
      UserSubscription.aggregate([
        { $match: { "payment.paymentStatus": "PAID" } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } }
      ])
    ]);

    return res.status(200).json({
      message: "Subscription stats fetched",
      data: {
        active,
        expiring,
        revenue: revenueAgg[0]?.total || 0
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptions = async (req, res) => {
  try {
    const {
      search = "",
      status,
      partnerId,
      page = 1,
      limit = 20
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);
    const query = {};

    if (status) query.status = status;
    if (partnerId && isValidObjectId(partnerId)) query.partnerId = partnerId;

    if (search) {
      const [users, partners] = await Promise.all([
        User.find({
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { mobileNumber: { $regex: search, $options: "i" } }
          ]
        }).select("_id"),
        Partner.find({ kitchenName: { $regex: search, $options: "i" } }).select("_id")
      ]);
      query.$or = [
        { userId: { $in: users.map((u) => u._id) } },
        { partnerId: { $in: partners.map((p) => p._id) } },
        { title: { $regex: search, $options: "i" } }
      ];
    }

    const [subscriptions, total] = await Promise.all([
      UserSubscription.find(query)
        .populate("userId", "fullName mobileNumber email")
        .populate("partnerId", "kitchenName ownerName")
        .populate("menuItemId", "name")
        .populate("subscriptionPlanId", "name durationInDays")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      UserSubscription.countDocuments(query)
    ]);

    return res.status(200).json({
      message: "Subscriptions fetched successfully",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data: subscriptions
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid subscription id" });
    }

    const subscription = await UserSubscription.findById(id)
      .populate("userId", "fullName mobileNumber email")
      .populate("partnerId", "kitchenName ownerName address")
      .populate("menuItemId", "name price")
      .populate("subscriptionPlanId", "name durationInDays mealsPerDay");

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const deliveries = await SubscriptionDelivery.find({ userSubscriptionId: id })
      .sort({ deliveryDate: 1 })
      .limit(30);

    return res.status(200).json({
      message: "Subscription details fetched",
      data: { subscription, deliveries }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateSubscriptionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid subscription id" });
    }

    const allowed = ["ACTIVE", "PAUSED", "CANCELLED", "COMPLETED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const subscription = await UserSubscription.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    return res.status(200).json({
      message: "Subscription status updated",
      data: subscription
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
