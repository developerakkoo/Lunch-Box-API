const mongoose = require("mongoose");
const User = require("../../module/user.model");
const Partner = require("../../module/partner.model");
const UserSubscription = require("../../module/userSubscription.model");
const SubscriptionDelivery = require("../../module/subscriptionDelivery.model");
const Order = require("../../module/order.model");
const DeliveryAgent = require("../../module/Delivery_Agent");
const { isSelfDeliveryOrder } = require("../../utils/selfDelivery");

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
        .populate("subscriptionPlanId", "title durationInDays planType")
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
      .populate("subscriptionPlanId", "title durationInDays mealsPerDay planType");

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const deliveries = await SubscriptionDelivery.find({ userSubscriptionId: id })
      .populate("linkedOrderId", "_id status deliveryAgent timeline createdAt orderType")
      .populate("deliveryBoyId", "fullName mobileNumber email")
      .sort({ deliveryDate: 1 })
      .limit(90);

    return res.status(200).json({
      message: "Subscription details fetched",
      data: { subscription, deliveries }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateSubscriptionDelivery = async (req, res) => {
  try {
    const { subscriptionId, deliveryId } = req.params;
    const { deliveryBoyId, status, skipReason, unlinkOrder } = req.body || {};

    if (!isValidObjectId(subscriptionId) || !isValidObjectId(deliveryId)) {
      return res.status(400).json({ message: "Invalid subscription or delivery id" });
    }

    const subscriptionExists = await UserSubscription.exists({ _id: subscriptionId });
    if (!subscriptionExists) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const delivery = await SubscriptionDelivery.findOne({
      _id: deliveryId,
      userSubscriptionId: subscriptionId
    });
    if (!delivery) {
      return res.status(404).json({ message: "Subscription delivery not found" });
    }

    const patchDriver = Object.prototype.hasOwnProperty.call(req.body || {}, "deliveryBoyId");
    const willSkip = status === "SKIPPED";
    const willUnlink = unlinkOrder === true;

    if (!patchDriver && !willSkip && !willUnlink) {
      return res.status(400).json({
        message: "Provide deliveryBoyId, status: SKIPPED, and/or unlinkOrder: true"
      });
    }

    if (patchDriver) {
      if (delivery.linkedOrderId) {
        const linkedOrder = await Order.findById(delivery.linkedOrderId).select("selfDelivery");
        if (linkedOrder && isSelfDeliveryOrder(linkedOrder)) {
          return res.status(409).json({
            message: "This delivery uses restaurant self-delivery",
          });
        }
      }

      if (deliveryBoyId === null || deliveryBoyId === "") {
        delivery.deliveryBoyId = null;
      } else {
        if (!isValidObjectId(deliveryBoyId)) {
          return res.status(400).json({ message: "Invalid deliveryBoyId" });
        }
        const agent = await DeliveryAgent.findById(deliveryBoyId);
        if (!agent) {
          return res.status(400).json({ message: "Delivery agent not found" });
        }
        delivery.deliveryBoyId = agent._id;
      }

      if (delivery.linkedOrderId) {
        await Order.findByIdAndUpdate(delivery.linkedOrderId, {
          deliveryAgent: delivery.deliveryBoyId
        }).exec();
      }
    }

    if (willSkip) {
      delivery.status = "SKIPPED";
      delivery.timeline = delivery.timeline || {};
      delivery.timeline.cancelledAt = new Date();
      if (skipReason) {
        delivery.rejectionReason = skipReason;
      }
    }

    if (willUnlink) {
      delivery.linkedOrderId = null;
    }

    await delivery.save();

    const populated = await SubscriptionDelivery.findById(delivery._id)
      .populate("linkedOrderId", "_id status deliveryAgent timeline orderType")
      .populate("deliveryBoyId", "fullName mobileNumber email");

    return res.status(200).json({
      message: "Subscription delivery updated",
      data: populated
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
