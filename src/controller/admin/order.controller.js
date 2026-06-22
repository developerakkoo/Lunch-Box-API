const mongoose = require("mongoose");
const Order = require("../../module/order.model");
const User = require("../../module/user.model");
const Partner = require("../../module/partner.model");
const DeliveryAgent = require("../../module/Delivery_Agent");
const assignDeliveryBoy = require("../../utils/deliveryAssignment");
const { isSelfDeliveryOrder } = require("../../utils/selfDelivery");
const {
  clearDriverAssignment,
  publishOrderEvent,
} = require("../../utils/orderEvents");
const {
  canTransition,
  applyTimelineForStatus,
  buildOrderStatusPayload,
  CLOSED_ORDER_STATUSES,
} = require("../../constants/orderStatus");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const isTruthy = (value) => value === true || value === "true" || value === 1 || value === "1";

async function assignDriverToOrder(order, { deliveryAgentId, autoAssign } = {}) {
  if (isSelfDeliveryOrder(order)) {
    return {
      status: 409,
      message: "This order uses restaurant self-delivery",
    };
  }

  if (isTruthy(autoAssign)) {
    const assignedDriver = await assignDeliveryBoy(order);
    if (!assignedDriver) {
      return {
        status: 404,
        message: "No available driver found",
      };
    }

    const refreshed = await Order.findById(order._id);
    await publishOrderEvent({
      type: "ORDER_ASSIGNED",
      order: refreshed,
      updatedBy: "ADMIN",
      driverId: assignedDriver._id,
    });

    return {
      status: 200,
      message: "Driver auto-assigned",
      data: refreshed,
    };
  }

  if (deliveryAgentId === null || deliveryAgentId === "") {
    if (order.deliveryAgent) {
      await clearDriverAssignment(order.deliveryAgent);
    }

    order.deliveryAgent = null;
    await order.save();
    await publishOrderEvent({ type: "ORDER_UNASSIGNED", order, updatedBy: "ADMIN" });

    return {
      status: 200,
      message: "Driver unassigned",
      data: order,
    };
  }

  if (!isValidObjectId(deliveryAgentId)) {
    return {
      status: 400,
      message: "Invalid delivery agent id",
    };
  }

  const agent = await DeliveryAgent.findById(deliveryAgentId);
  if (!agent) {
    return {
      status: 404,
      message: "Delivery agent not found",
    };
  }

  if (agent.deletedAt) {
    return {
      status: 400,
      message: "This driver account is archived",
    };
  }

  if (agent.status !== "APPROVED") {
    return {
      status: 400,
      message: "Only approved drivers can be assigned to an order",
    };
  }

  order.deliveryAgent = agent._id;
  await order.save();

  agent.currentOrder = order._id;
  agent.isAvailable = false;
  await agent.save();

  global.io?.to(`delivery_${agent._id}`).emit("order_assigned", order);

  await publishOrderEvent({
    type: "ORDER_ASSIGNED",
    order,
    updatedBy: "ADMIN",
    driverId: agent._id,
  });

  return {
    status: 200,
    message: "Driver assigned successfully",
    data: order,
  };
}

exports.getAllOrders = async (req, res) => {
  try {
    const {
      search = "",
      status,
      statusIn,
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

    if (statusIn) {
      const statuses = String(statusIn)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length) query.status = { $in: statuses };
    } else if (status) {
      query.status = status;
    }
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
      data: order,
      statusMeta: buildOrderStatusPayload(order),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.assignDriver = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryAgentId, autoAssign } = req.body || {};

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (CLOSED_ORDER_STATUSES.includes(order.status)) {
      return res.status(409).json({ message: `Order is ${order.status}` });
    }

    const result = await assignDriverToOrder(order, { deliveryAgentId, autoAssign });
    return res.status(result.status).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, deliveryAgentId, autoAssign } = req.body || {};

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    const allowed = [
      "PLACED",
      "ACCEPTED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED"
    ];

    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ message: "Valid status is required" });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (CLOSED_ORDER_STATUSES.includes(order.status) && status !== order.status) {
      return res.status(409).json({ message: `Order already ${order.status.toLowerCase()}` });
    }

    const isAssignmentRequest =
      status === "ACCEPTED" && order.status === "READY";

    if (isAssignmentRequest) {
      const result = await assignDriverToOrder(order, {
        deliveryAgentId,
        autoAssign: autoAssign !== undefined ? autoAssign : deliveryAgentId === undefined ? true : undefined,
      });
      return res.status(result.status).json({
        message: result.message,
        data: result.data,
      });
    }

    if (!canTransition(order.status, status, "ADMIN")) {
      return res.status(400).json({
        message: `Cannot transition from ${order.status} to ${status}`,
      });
    }

    order.status = status;
    applyTimelineForStatus(order, status);
    await order.save();

    await publishOrderEvent({
      type: "ORDER_STATUS_UPDATED",
      order,
      updatedBy: "ADMIN"
    });

    return res.status(200).json({
      message: "Order status updated successfully",
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
    await publishOrderEvent({
      type: "ORDER_CANCELLED",
      order,
      cancelledBy: "ADMIN",
      reason
    });
    if (order.deliveryAgent) {
      await clearDriverAssignment(order.deliveryAgent);
    }

    return res.status(200).json({
      message: "Order cancelled successfully",
      refundMessage,
      data: order
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
