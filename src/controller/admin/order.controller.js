const mongoose = require("mongoose");
const Order = require("../../module/order.model");
const User = require("../../module/user.model");
const Partner = require("../../module/partner.model");
const DeliveryAgent = require("../../module/Delivery_Agent");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const CLOSED_ORDER_STATUSES = ["DELIVERED", "CANCELLED"];

exports.getAllOrders = async (req, res) => {
  try {
    const {
      search = "",
      status,
      paymentStatus,
      paymentMethod,
      partnerId,
      userId,
      deliveryAgentId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);
    const query = {};

    if (status) query.status = status;
    if (paymentStatus) query["payment.paymentStatus"] = paymentStatus;
    if (paymentMethod) query["payment.method"] = paymentMethod;
    if (partnerId && isValidObjectId(partnerId)) query.partner = partnerId;
    if (userId && isValidObjectId(userId)) query.user = userId;
    if (deliveryAgentId && isValidObjectId(deliveryAgentId)) query.deliveryAgent = deliveryAgentId;

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    if (search) {
      const [users, kitchens, drivers] = await Promise.all([
        User.find({
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { mobileNumber: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } }
          ]
        }).select("_id"),
        Partner.find({
          $or: [
            { kitchenName: { $regex: search, $options: "i" } },
            { ownerName: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } }
          ]
        }).select("_id"),
        DeliveryAgent.find({
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { mobileNumber: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } }
          ]
        }).select("_id")
      ]);

      query.$or = [
        ...(isValidObjectId(search) ? [{ _id: search }] : []),
        { "items.name": { $regex: search, $options: "i" } },
        { user: { $in: users.map((item) => item._id) } },
        { partner: { $in: kitchens.map((item) => item._id) } },
        { deliveryAgent: { $in: drivers.map((item) => item._id) } }
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("user", "fullName mobileNumber email")
        .populate("partner", "kitchenName ownerName phone")
        .populate("deliveryAgent", "fullName mobileNumber")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      Order.countDocuments(query)
    ]);

    return res.status(200).json({
      message: "Orders fetched successfully",
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total
      },
      data: orders
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    const order = await Order.findById(orderId)
      .populate("user", "fullName mobileNumber email addresses walletBalance")
      .populate("partner", "kitchenName ownerName phone address status isActive")
      .populate("deliveryAgent", "fullName mobileNumber status isOnline isAvailable")
      .populate("items.menuItem", "name description price");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json({
      message: "Order details fetched successfully",
      data: order
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason = "Cancelled by admin" } = req.body || {};

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (CLOSED_ORDER_STATUSES.includes(order.status)) {
      return res.status(409).json({ message: `Order already ${order.status.toLowerCase()}` });
    }

    order.status = "CANCELLED";
    order.timeline.cancelledAt = new Date();
    order.cancellation = {
      cancelledBy: "SYSTEM",
      reason
    };

    let refundMessage = null;

    if (order.payment?.method === "WALLET" && order.payment?.paymentStatus === "PAID") {
      const user = await User.findById(order.user);
      if (user) {
        const refundAmount = Number(order.priceDetails?.totalAmount || 0);
        user.walletBalance = (user.walletBalance || 0) + refundAmount;
        await user.save();
        order.payment.paymentStatus = "REFUNDED";
        refundMessage = `Wallet refunded with ${refundAmount}`;
        global.io?.to(`user_${order.user}`).emit("wallet_refunded", {
          orderId: order._id,
          amount: refundAmount
        });
      }
    }

    if (order.deliveryAgent) {
      await DeliveryAgent.findByIdAndUpdate(order.deliveryAgent, {
        $set: {
          currentOrder: null,
          isAvailable: true
        }
      });
    }

    await order.save();

    global.io?.to(`user_${order.user}`).emit("order_cancelled", order);
    global.io?.to(`kitchen_${order.partner}`).emit("order_cancelled_by_user", {
      orderId: order._id,
      reason,
      cancelledBy: "ADMIN"
    });

    return res.status(200).json({
      message: "Order cancelled successfully",
      refundMessage,
      data: order
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
