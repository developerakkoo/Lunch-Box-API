const jwt = require("jsonwebtoken");
const { getIO } = require("./socket");
const Order = require("../module/order.model");
const Cart = require("../module/cart.model");
const User = require("../module/user.model");
const DeliveryAgent = require("../module/Delivery_Agent");
const assignDeliveryBoy = require("../utils/deliveryAssignment");
const { notifyPartner } = require("../utils/partnerNotification");
const { createOrder } = require("../utils/razorpay");
const { getManagedHotelIds } = require("../utils/partnerAccess");

const CUSTOMER_STATUS = {
  PLACED: "ORDER_RECEIVED",
  ACCEPTED: "ACCEPTED",
  PREPARING: "PROCESSING",
  READY: "READY_FOR_PICKUP",
  OUT_FOR_DELIVERY: "ON_ROUTE",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED"
};

const emitOrderStatusUpdate = (io, order) => {
  io.to(`user_${order.user}`).emit("order_status_update", {
    orderId: order._id,
    status: CUSTOMER_STATUS[order.status] || order.status,
    internalStatus: order.status,
    timeline: order.timeline
  });
};

const getSocketActor = async (socket) => {
  if (socket.data.actor) return socket.data.actor;

  const token = socket.handshake.auth?.token;
  const role = socket.handshake.auth?.role;
  if (!token || !role) return null;

  try {
    if (role === "USER") {
      const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
      socket.data.actor = { role, id: decoded.id };
      return socket.data.actor;
    }

    if (role === "PARTNER") {
      const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
      socket.data.actor = { role, id: decoded.id };
      return socket.data.actor;
    }

    if (role === "DELIVERY_AGENT") {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.actor = { role, id: decoded.id };
      return socket.data.actor;
    }
  } catch (error) {
    return null;
  }

  return null;
};

const requireActor = async (socket, allowedRoles) => {
  const actor = await getSocketActor(socket);
  if (!actor || !allowedRoles.includes(actor.role)) {
    return { error: { status: "error", message: "Unauthorized socket action" } };
  }
  return { actor };
};

const orderSocketHandler = () => {
  const io = getIO();

  io.on("connection", (socket) => {
    socket.on("join_user", async (userId, callback) => {
      const { actor, error } = await requireActor(socket, ["USER"]);
      if (error) return callback && callback(error);
      if (String(actor.id) !== String(userId)) {
        return callback && callback({ status: "error", message: "Cannot join another user room" });
      }
      socket.join(`user_${userId}`);
      callback && callback({ status: "ok" });
    });

    socket.on("join_kitchen", async (kitchenId, callback) => {
      const { actor, error } = await requireActor(socket, ["PARTNER"]);
      if (error) return callback && callback(error);
      const { hotelIds } = await getManagedHotelIds(actor.id);
      if (!hotelIds.includes(String(kitchenId))) {
        return callback && callback({ status: "error", message: "Cannot join another kitchen room" });
      }
      socket.join(`kitchen_${kitchenId}`);
      callback && callback({ status: "ok" });
    });

    socket.on("join_delivery", async (deliveryId, callback) => {
      const { actor, error } = await requireActor(socket, ["DELIVERY_AGENT"]);
      if (error) return callback && callback(error);
      if (String(actor.id) !== String(deliveryId)) {
        return callback && callback({ status: "error", message: "Cannot join another delivery room" });
      }
      socket.join(`delivery_${deliveryId}`);
      callback && callback({ status: "ok" });
    });

    socket.on("join_order", async (orderId, callback) => {
      const { actor, error } = await requireActor(socket, ["USER", "PARTNER", "DELIVERY_AGENT"]);
      if (error) return callback && callback(error);

      const query =
        actor.role === "USER"
          ? { _id: orderId, user: actor.id }
          : actor.role === "PARTNER"
            ? { _id: orderId, partner: { $in: (await getManagedHotelIds(actor.id)).hotelIds } }
            : { _id: orderId, deliveryAgent: actor.id };

      const order = await Order.findOne(query).select("_id");
      if (!order) {
        return callback && callback({ status: "error", message: "Order room access denied" });
      }

      socket.join(`order_${orderId}`);
      callback && callback({ status: "ok" });
    });

    socket.on("create_order", async (payload, callback) => {
      try {
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { addressId, paymentMethod = "COD" } = payload || {};
        const userId = actor.id;

        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
          return callback && callback({ status: "error", message: "Cart is empty" });
        }

        const user = await User.findById(userId);
        const address = user?.addresses?.id(addressId);
        if (!address) {
          return callback && callback({ status: "error", message: "Invalid address" });
        }

        if (!["COD", "ONLINE", "WALLET"].includes(paymentMethod)) {
          return callback && callback({ status: "error", message: "Invalid payment method" });
        }

        if (paymentMethod === "WALLET") {
          if ((user.walletBalance || 0) < cart.totalAmount) {
            return callback && callback({ status: "error", message: "Insufficient wallet balance" });
          }
          user.walletBalance = (user.walletBalance || 0) - cart.totalAmount;
          await user.save();
        }

        const order = await Order.create({
          user: userId,
          partner: cart.kitchenId,
          items: cart.items.map((item) => ({
            menuItem: item.productId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            addons: (item.addOns || []).map((addon) => ({
              name: addon.name,
              price: addon.price
            }))
          })),
          priceDetails: {
            itemTotal: cart.totalAmount,
            tax: 0,
            deliveryCharge: 0,
            platformFee: 0,
            discount: 0,
            totalAmount: cart.totalAmount
          },
          deliveryAddress: {
            fullAddress: address.fullAddress,
            latitude: address.latitude,
            longitude: address.longitude
          },
          payment: {
            method: paymentMethod,
            paymentStatus: paymentMethod === "WALLET" ? "PAID" : "PENDING"
          },
          status: "PLACED",
          timeline: {
            placedAt: new Date()
          }
        });

        let razorpayOrder = null;
        if (paymentMethod === "ONLINE") {
          razorpayOrder = await createOrder(Math.round((order.priceDetails?.totalAmount || 0) * 100));
          order.payment.gatewayOrderId = razorpayOrder.id;
          await order.save();
        }

        cart.items = [];
        cart.totalAmount = 0;
        await cart.save();

        io.to(`kitchen_${order.partner}`).emit("new_order", order);
        emitOrderStatusUpdate(io, order);
        await notifyPartner({
          partnerId: order.partner,
          type: "NEW_ORDER",
          title: "New Order Received",
          message: `You received a new order #${order._id.toString().slice(-6)}`,
          data: { orderId: order._id, status: order.status }
        });

        callback && callback({ status: "ok", order, razorpayOrder });
      } catch (error) {
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("kitchen_action", async (payload, callback) => {
      try {
        const { actor, error } = await requireActor(socket, ["PARTNER"]);
        if (error) return callback && callback(error);

        const { orderId, action } = payload || {};
        const order = await Order.findById(orderId);
        if (!order) return callback && callback({ status: "error", message: "Order not found" });
        const { hotelIds } = await getManagedHotelIds(actor.id);
        if (!hotelIds.includes(String(order.partner))) {
          return callback && callback({ status: "error", message: "Unauthorized kitchen action" });
        }

        if (order.payment?.method === "ONLINE" && order.payment?.paymentStatus !== "PAID" && action !== "REJECT") {
          return callback && callback({ status: "error", message: "Online payment must be confirmed first" });
        }

        if (action === "ACCEPT") {
          if (order.status !== "PLACED") {
            return callback && callback({ status: "error", message: "Only placed orders can be accepted" });
          }
          order.status = "ACCEPTED";
          order.timeline.acceptedAt = new Date();
          await order.save();
          io.to(`user_${order.user}`).emit("order_accepted", order);
        } else if (action === "PREPARING") {
          if (!["ACCEPTED", "PREPARING"].includes(order.status)) {
            return callback && callback({ status: "error", message: "Order cannot move to preparing" });
          }
          order.status = "PREPARING";
          order.timeline.preparingAt = order.timeline.preparingAt || new Date();
          await order.save();
          io.to(`user_${order.user}`).emit("order_preparing", order);
        } else if (action === "READY") {
          if (!["PREPARING", "READY"].includes(order.status)) {
            return callback && callback({ status: "error", message: "Order cannot move to ready" });
          }
          order.status = "READY";
          order.timeline.readyAt = new Date();
          await order.save();
          io.to(`user_${order.user}`).emit("order_ready", order);
          if (!order.deliveryAgent) {
            await assignDeliveryBoy(order);
          }
        } else if (action === "REJECT") {
          order.status = "CANCELLED";
          order.timeline.cancelledAt = new Date();
          await order.save();
          io.to(`user_${order.user}`).emit("order_cancelled", order);
        } else {
          return callback && callback({ status: "error", message: "Invalid action" });
        }

        emitOrderStatusUpdate(io, order);
        callback && callback({ status: "ok", order });
      } catch (error) {
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("delivery_start", async (payload, callback) => {
      try {
        const { actor, error } = await requireActor(socket, ["DELIVERY_AGENT"]);
        if (error) return callback && callback(error);

        const { orderId } = payload || {};
        const order = await Order.findById(orderId);
        if (!order) return callback && callback({ status: "error", message: "Order not found" });
        if (!order.deliveryAgent || String(order.deliveryAgent) !== String(actor.id)) {
          return callback && callback({ status: "error", message: "Order is not assigned to this driver" });
        }
        if (order.status !== "READY") {
          return callback && callback({ status: "error", message: "Only ready orders can start delivery" });
        }

        order.status = "OUT_FOR_DELIVERY";
        order.timeline.pickedAt = new Date();
        await order.save();

        io.to(`user_${order.user}`).emit("delivery_started", order);
        emitOrderStatusUpdate(io, order);
        callback && callback({ status: "ok", order });
      } catch (error) {
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("mark_delivered", async (payload, callback) => {
      try {
        const { actor, error } = await requireActor(socket, ["DELIVERY_AGENT"]);
        if (error) return callback && callback(error);

        const { orderId } = payload || {};
        const order = await Order.findById(orderId);
        if (!order) return callback && callback({ status: "error", message: "Order not found" });
        if (!order.deliveryAgent || String(order.deliveryAgent) !== String(actor.id)) {
          return callback && callback({ status: "error", message: "Order is not assigned to this driver" });
        }
        if (order.status !== "OUT_FOR_DELIVERY") {
          return callback && callback({ status: "error", message: "Only active delivery orders can be completed" });
        }

        order.status = "DELIVERED";
        order.timeline.deliveredAt = new Date();
        if (order.payment?.method === "COD") {
          order.payment.paymentStatus = "PAID";
        }
        await order.save();

        await DeliveryAgent.findByIdAndUpdate(actor.id, {
          $set: {
            currentOrder: null,
            isAvailable: true
          }
        });

        io.to(`user_${order.user}`).emit("order_delivered", order);
        emitOrderStatusUpdate(io, order);
        callback && callback({ status: "ok", order });
      } catch (error) {
        callback && callback({ status: "error", message: error.message });
      }
    });
  });
};

const emitOrderPicked = (order) => {
  if (!order?.user) return;
  const io = getIO();
  io.to(`user_${order.user}`).emit("order_picked", order);
  emitOrderStatusUpdate(io, order);
};

const emitOrderDelivered = (order) => {
  if (!order?.user) return;
  const io = getIO();
  io.to(`user_${order.user}`).emit("order_delivered", order);
  emitOrderStatusUpdate(io, order);
};

const emitNewOrderToKitchen = (order) => {
  if (!order?.partner) return;
  const io = getIO();
  io.to(`kitchen_${order.partner}`).emit("new_order", order);
};

module.exports = {
  orderSocketHandler,
  emitOrderPicked,
  emitOrderDelivered,
  emitNewOrderToKitchen
};
