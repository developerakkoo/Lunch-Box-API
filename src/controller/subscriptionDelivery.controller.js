const mongoose = require("mongoose");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const UserSubscription = require("../module/userSubscription.model");
const logger = require("../utils/logger");
const { getManagedHotelIds, resolveAccessibleHotel } = require("../utils/partnerAccess");
const {
  materializeOrderFromSubscriptionDelivery,
} = require("../utils/subscriptionOrderBridge");
const { isDateInPause } = require("../services/subscriptionSchedule.service");
const { notifyUser } = require("../utils/userNotification");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const PARTNER_ACTION_MAP = {
  ACCEPT: "ACCEPTED",
  REJECT: "REJECTED",
  PREPARING: "PREPARING",
  READY: "READY",
};

const formatDeliveryDate = (date) => {
  try {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  } catch (_e) {
    return "";
  }
};

const USER_DELIVERY_MESSAGES = {
  ACCEPTED: (dateLabel) => ({
    title: "Meal accepted",
    message: `Your subscription meal${dateLabel ? ` for ${dateLabel}` : ""} was accepted by the kitchen.`,
  }),
  REJECTED: (dateLabel, reason) => ({
    title: "Meal rejected",
    message: `Your subscription meal${dateLabel ? ` for ${dateLabel}` : ""} was rejected by the kitchen.${reason ? ` Reason: ${reason}` : ""}`,
  }),
  PREPARING: (dateLabel) => ({
    title: "Meal being prepared",
    message: `The kitchen started preparing your subscription meal${dateLabel ? ` for ${dateLabel}` : ""}.`,
  }),
  READY: (dateLabel) => ({
    title: "Meal ready",
    message: `Your subscription meal${dateLabel ? ` for ${dateLabel}` : ""} is ready and will be out for delivery soon.`,
  }),
};

exports.partnerListDeliveries = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const { status = "NEW", page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const subs = await UserSubscription.find({
      partnerId: selectedHotel._id,
      status: "ACTIVE",
    }).select("_id");
    const subIds = subs.map((s) => s._id);

    const statusFilter =
      status === "NEW"
        ? ["PENDING_PARTNER", "PENDING"]
        : status === "ONGOING"
          ? ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]
          : status === "COMPLETED"
            ? ["DELIVERED"]
            : [status];

    const [deliveries, total] = await Promise.all([
      SubscriptionDelivery.find({
        userSubscriptionId: { $in: subIds },
        status: { $in: statusFilter },
      })
        .populate({
          path: "userSubscriptionId",
          populate: [
            { path: "userId", select: "fullName mobileNumber" },
            { path: "menuItemId", select: "name image price" },
          ],
        })
        .sort({ deliveryDate: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      SubscriptionDelivery.countDocuments({
        userSubscriptionId: { $in: subIds },
        status: { $in: statusFilter },
      }),
    ]);

    return res.status(200).json({
      message: "Subscription deliveries fetched",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data: deliveries,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.partnerDeliveryAction = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid delivery id" });
    }

    const nextStatus = PARTNER_ACTION_MAP[action];
    if (!nextStatus) {
      return res.status(400).json({ message: "Invalid action" });
    }

    let delivery = await SubscriptionDelivery.findById(id).populate("userSubscriptionId");
    if (!delivery) {
      return res.status(404).json({ message: "Delivery not found" });
    }

    const partnerId = delivery.userSubscriptionId?.partnerId;
    const sub = delivery.userSubscriptionId;
    if (sub?.status === "PAUSED" || isDateInPause(sub, delivery.deliveryDate)) {
      return res.status(400).json({ message: "Subscription is paused for this delivery date" });
    }

    const { hotelIds } = await getManagedHotelIds(req.partner?.id || req.user?.id);
    if (!hotelIds.includes(String(partnerId))) {
      return res.status(403).json({ message: "Access denied" });
    }

    delivery.status = nextStatus;
    delivery.timeline = delivery.timeline || {};
    const now = new Date();
    if (nextStatus === "ACCEPTED") delivery.timeline.acceptedAt = now;
    if (nextStatus === "PREPARING") delivery.timeline.preparingAt = now;
    if (nextStatus === "READY") delivery.timeline.readyAt = now;
    if (nextStatus === "REJECTED") {
      delivery.timeline.rejectedAt = now;
      delivery.rejectionReason = reason || "Rejected by partner";
    }

    await delivery.save();

    if (nextStatus === "READY") {
      try {
        await materializeOrderFromSubscriptionDelivery(delivery._id);
      } catch (bridgeErr) {
        logger.error("Subscription → Order bridge failed", {
          deliveryId: String(delivery._id),
          message: bridgeErr?.message
        });
      }
      const reloaded = await SubscriptionDelivery.findById(delivery._id)
        .populate("userSubscriptionId")
        .populate({
          path: "linkedOrderId",
          select: "status timeline orderType subscriptionDeliveryId deliveryAgent createdAt user",
        });
      if (reloaded) {
        delivery = reloaded;
      }
    }

    const userId = sub?.userId;

    const io = global.io;
    if (io && partnerId) {
      io.to(`kitchen_${partnerId}`).emit("subscription_delivery_update", { delivery });
      if (["PENDING_PARTNER", "PENDING"].includes(delivery.status) || action === "ACCEPT") {
        io.to(`kitchen_${partnerId}`).emit("new_subscription_delivery", delivery);
      }
    }
    if (io && userId) {
      io.to(`user_${userId}`).emit("subscription_delivery_update", { delivery });
    }

    const buildMessage = USER_DELIVERY_MESSAGES[nextStatus];
    if (userId && buildMessage) {
      const dateLabel = formatDeliveryDate(delivery.deliveryDate);
      const { title, message } =
        nextStatus === "REJECTED"
          ? buildMessage(dateLabel, delivery.rejectionReason)
          : buildMessage(dateLabel);
      notifyUser({
        userId,
        type: "SUBSCRIPTION",
        title,
        message,
        data: {
          type: "SUBSCRIPTION",
          deliveryId: String(delivery._id),
          subscriptionId: String(sub?._id || ""),
          status: delivery.status,
        },
      }).catch((notifyErr) => {
        logger.error("Failed to notify user about subscription delivery", {
          deliveryId: String(delivery._id),
          message: notifyErr?.message,
        });
      });
    }

    return res.status(200).json({
      message: `Delivery updated`,
      data: delivery,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.activateTodaysDeliveries = async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const result = await SubscriptionDelivery.updateMany(
      {
        deliveryDate: { $gte: start, $lte: end },
        status: { $in: ["PENDING"] },
      },
      { $set: { status: "PENDING_PARTNER" } }
    );

    return res.status(200).json({
      message: "Today's deliveries activated for partner review",
      modified: result.modifiedCount,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
