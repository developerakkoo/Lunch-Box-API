const DeliveryAgent = require("../module/Delivery_Agent");
const DeliveryNotification = require("../module/deliveryNotification.model");
const Order = require("../module/order.model");
const User = require("../module/user.model");
const Partner = require("../module/partner.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  emitOrderPicked,
  emitOrderDelivered
} = require("../socket/order.socket");
const { notifyDeliveryAgent } = require("../utils/deliveryNotification");

const getDriverIdFromReq = (req) => req?.driver?.id;

const findAgentFromToken = async (driverId) => {
  if (!driverId) return null;
  const agent = await DeliveryAgent.findById(driverId);
  if (agent) return agent;
  return DeliveryAgent.findOne({ user: driverId });
};

exports.registerDriver = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      mobileNumber,
      address,
      vehicle = {},
      documents = {}
    } = req.body;

    if (!fullName || !email || !password || !mobileNumber || !address) {
      return res.status(400).json({ message: "fullName, email, password, mobileNumber and address are required" });
    }

    const exists = await DeliveryAgent.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const driver = await DeliveryAgent.create({
      fullName,
      email: email.toLowerCase(),
      password: hashedPassword,
      mobileNumber,
      address,
      vehicle,
      documents,
      profileCompleted: true
    });

    return res.status(201).json({
      message: "Driver registered successfully",
      data: driver
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.loginDriver = async (req, res) => {
  try {
    const { email, password } = req.body;
    const driver = await DeliveryAgent.findOne({ email: String(email || "").toLowerCase() });

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    const isMatch = await bcrypt.compare(password, driver.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: driver._id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      driver
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    return res.status(200).json({
      message: "Profile fetched successfully",
      data: agent
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const {
      fullName,
      mobileNumber,
      address,
      profileImage,
      vehicle,
      documents
    } = req.body || {};

    if (fullName !== undefined) agent.fullName = fullName;
    if (mobileNumber !== undefined) agent.mobileNumber = mobileNumber;
    if (address !== undefined) agent.address = address;
    if (profileImage !== undefined) agent.profileImage = profileImage;
    if (vehicle !== undefined) agent.vehicle = vehicle;
    if (documents !== undefined) agent.documents = documents;

    await agent.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      data: agent
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.toggleOnlineStatus = async (req, res) => {
  try {
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    agent.isOnline = !agent.isOnline;
    if (agent.isOnline) {
      agent.shift.startedAt = new Date();
    } else {
      agent.shift.endedAt = new Date();
    }

    await agent.save();

    return res.status(200).json({
      message: "Driver status updated",
      data: {
        isOnline: agent.isOnline,
        isAvailable: agent.isAvailable
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateAvailabilityStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({ message: "status must be ACTIVE or INACTIVE" });
    }

    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    agent.isOnline = status === "ACTIVE";
    agent.isAvailable = status === "ACTIVE" ? agent.isAvailable : false;
    if (agent.isOnline) {
      agent.shift.startedAt = new Date();
    } else {
      agent.shift.endedAt = new Date();
    }
    await agent.save();

    return res.status(200).json({
      message: "Availability status updated",
      data: {
        status,
        isOnline: agent.isOnline,
        isAvailable: agent.isAvailable
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateLiveLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: "latitude and longitude are required" });
    }

    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    agent.liveLocation = {
      latitude,
      longitude,
      updatedAt: new Date()
    };
    await agent.save();

    return res.status(200).json({
      message: "Location updated successfully",
      data: agent.liveLocation
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getOrdersByDeliveryStatus = async (req, res) => {
  try {
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const { status = "PENDING", page = 1, limit = 20 } = req.query;
    const map = {
      PENDING: ["ACCEPTED", "READY"],
      RUNNING: ["OUT_FOR_DELIVERY"],
      COMPLETED: ["DELIVERED"]
    };
    const statuses = map[status] || [status];
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const query = status === "PENDING"
      ? {
          status: { $in: statuses },
          $or: [
            { deliveryAgent: null },
            { deliveryAgent: agent._id }
          ]
        }
      : {
          deliveryAgent: agent._id,
          status: { $in: statuses }
        };

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("partner", "kitchenName address latitude longitude phone")
        .populate("user", "fullName mobileNumber")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      Order.countDocuments(query)
    ]);

    return res.status(200).json({
      message: "Orders fetched successfully",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data: orders
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    if (!agent.isOnline) return res.status(400).json({ message: "Agent offline" });
    if (!agent.isAvailable) return res.status(400).json({ message: "Already handling another order" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!["ACCEPTED", "READY"].includes(order.status)) {
      return res.status(400).json({ message: "Order not ready for delivery" });
    }

    if (order.deliveryAgent && String(order.deliveryAgent) !== String(agent._id)) {
      return res.status(400).json({ message: "Order already assigned to another delivery agent" });
    }

    order.deliveryAgent = agent._id;
    order.status = "OUT_FOR_DELIVERY";
    order.timeline = order.timeline || {};
    order.timeline.pickedAt = new Date();
    await order.save();

    agent.currentOrder = order._id;
    agent.isAvailable = false;
    await agent.save();

    await notifyDeliveryAgent({
      deliveryAgentId: agent._id,
      type: "ORDER_ACCEPTED",
      title: "Order Accepted",
      message: `You accepted order #${order._id.toString().slice(-6)}`,
      data: { orderId: order._id }
    });

    global.io?.to(`user_${order.user}`).emit("delivery_started", order);
    emitOrderPicked(order);

    return res.status(200).json({
      message: "Order accepted successfully",
      data: order
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.rejectOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason = "Rejected by delivery agent" } = req.body || {};

    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.deliveryAgent && String(order.deliveryAgent) !== String(agent._id)) {
      return res.status(403).json({ message: "Order is not assigned to this delivery agent" });
    }

    order.deliveryAgent = null;
    order.status = "ACCEPTED";
    order.timeline = order.timeline || {};
    order.timeline.pickedAt = null;
    await order.save();

    agent.currentOrder = null;
    agent.isAvailable = true;
    await agent.save();

    await notifyDeliveryAgent({
      deliveryAgentId: agent._id,
      type: "ORDER_REJECTED",
      title: "Order Rejected",
      message: `You rejected order #${order._id.toString().slice(-6)}`,
      data: { orderId: order._id, reason }
    });

    global.io?.to(`kitchen_${order.partner}`).emit("delivery_rejected", {
      orderId: order._id,
      reason
    });

    return res.status(200).json({
      message: "Order rejected successfully",
      data: order
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.pickOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.deliveryAgent || String(order.deliveryAgent) !== String(agent._id)) {
      return res.status(403).json({ message: "Order is not assigned to this delivery agent" });
    }

    order.status = "OUT_FOR_DELIVERY";
    order.timeline = order.timeline || {};
    order.timeline.pickedAt = new Date();
    await order.save();

    emitOrderPicked(order);

    return res.status(200).json({
      message: "Order picked successfully",
      data: order
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.completeOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.deliveryAgent || String(order.deliveryAgent) !== String(agent._id)) {
      return res.status(403).json({ message: "Order is not assigned to this delivery agent" });
    }

    order.status = "DELIVERED";
    order.timeline = order.timeline || {};
    order.timeline.deliveredAt = new Date();

    if (order.payment?.method === "COD") {
      order.payment.paymentStatus = "PAID";
    }

    await order.save();

    const deliveryFee = 40;
    agent.earnings.today = (agent.earnings.today || 0) + deliveryFee;
    agent.earnings.total = (agent.earnings.total || 0) + deliveryFee;
    agent.currentOrder = null;
    agent.isAvailable = true;
    await agent.save();

    await notifyDeliveryAgent({
      deliveryAgentId: agent._id,
      type: "ORDER_COMPLETED",
      title: "Order Completed",
      message: `Order #${order._id.toString().slice(-6)} completed`,
      data: { orderId: order._id }
    });

    emitOrderDelivered(order);

    return res.status(200).json({
      message: "Order completed successfully",
      data: order
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getRouteDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const order = await Order.findById(orderId)
      .populate("partner", "kitchenName address latitude longitude")
      .populate("user", "fullName mobileNumber");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.deliveryAgent || String(order.deliveryAgent) !== String(agent._id)) {
      return res.status(403).json({ message: "Order is not assigned to this delivery agent" });
    }

    return res.status(200).json({
      message: "Route details fetched successfully",
      data: {
        kitchen: {
          id: order.partner?._id,
          name: order.partner?.kitchenName,
          address: order.partner?.address,
          latitude: order.partner?.latitude,
          longitude: order.partner?.longitude
        },
        customer: {
          id: order.user?._id,
          name: order.user?.fullName,
          mobileNumber: order.user?.mobileNumber,
          address: order.deliveryAddress?.fullAddress,
          latitude: order.deliveryAddress?.latitude,
          longitude: order.deliveryAddress?.longitude
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getCustomerContact = async (req, res) => {
  try {
    const { orderId } = req.params;
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const order = await Order.findById(orderId).populate("user", "fullName mobileNumber");
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (!order.deliveryAgent || String(order.deliveryAgent) !== String(agent._id)) {
      return res.status(403).json({ message: "Order is not assigned to this delivery agent" });
    }

    return res.status(200).json({
      message: "Customer contact fetched successfully",
      data: {
        customerId: order.user?._id,
        fullName: order.user?.fullName,
        mobileNumber: order.user?.mobileNumber,
        dialUrl: `tel:${order.user?.mobileNumber || ""}`
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const [notifications, total, unreadCount] = await Promise.all([
      DeliveryNotification.find({ deliveryAgentId: agent._id })
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      DeliveryNotification.countDocuments({ deliveryAgentId: agent._id }),
      DeliveryNotification.countDocuments({ deliveryAgentId: agent._id, isRead: false })
    ]);

    return res.status(200).json({
      message: "Notifications fetched successfully",
      pagination: { page: pageNumber, limit: limitNumber, total },
      unreadCount,
      data: notifications
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const { notificationId } = req.params;
    const notification = await DeliveryNotification.findOneAndUpdate(
      { _id: notificationId, deliveryAgentId: agent._id },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({
      message: "Notification marked as read",
      data: notification
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    await DeliveryNotification.updateMany(
      { deliveryAgentId: agent._id, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      message: "All notifications marked as read"
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const agent = await findAgentFromToken(getDriverIdFromReq(req));
    if (!agent) return res.status(404).json({ message: "Agent profile not found" });

    const [totalDeliveredOrders, grossSalesResult, cashAmountResult, tipsEarnedResult, rejectedOrders, ordersReceived] =
      await Promise.all([
        Order.countDocuments({ deliveryAgent: agent._id, status: "DELIVERED" }),
        Order.aggregate([
          { $match: { deliveryAgent: agent._id, status: "DELIVERED" } },
          { $group: { _id: null, total: { $sum: "$priceDetails.totalAmount" } } }
        ]),
        Order.aggregate([
          { $match: { deliveryAgent: agent._id, status: "DELIVERED", "payment.method": "COD" } },
          { $group: { _id: null, total: { $sum: "$priceDetails.totalAmount" } } }
        ]),
        Order.aggregate([
          { $match: { deliveryAgent: agent._id, "tip.paymentStatus": "PAID" } },
          { $group: { _id: null, total: { $sum: "$tip.amount" } } }
        ]),
        DeliveryNotification.countDocuments({
          deliveryAgentId: agent._id,
          type: "ORDER_REJECTED"
        }),
        DeliveryNotification.countDocuments({
          deliveryAgentId: agent._id,
          type: "ORDER_ASSIGNED"
        })
      ]);

    return res.status(200).json({
      message: "Driver dashboard fetched successfully",
      data: {
        totalDeliveredOrders,
        grossSales: grossSalesResult[0]?.total || 0,
        rejectedOrders,
        ordersReceived,
        tipsEarned: tipsEarnedResult[0]?.total || 0,
        cashAmount: cashAmountResult[0]?.total || 0,
        isOnline: agent.isOnline,
        isAvailable: agent.isAvailable,
        currentOrder: agent.currentOrder
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
