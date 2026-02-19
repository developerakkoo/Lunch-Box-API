const { getIO } = require("./socket");
const Order = require("../module/order.model");
const Cart = require("../module/cart.model");
const User = require("../module/user.model");
const assignDeliveryBoy = require("../utils/deliveryAssignment");

const emitOrderStatusUpdate = (io, order, status) => {
  io.to(`user_${order.user}`).emit("order_status_update", {
    orderId: order._id,
    status,
    internalStatus: order.status,
    timeline: order.timeline
  });
};

const orderSocketHandler = () => {
  const io = getIO();

  io.on("connection", (socket) => {
    console.log("🟢 New Socket Connected:", socket.id);

    socket.on("join_user", (userId) => {
      socket.join(`user_${userId}`);
      console.log(`👤 User joined room: user_${userId}`);
    });

    socket.on("join_kitchen", (kitchenId) => {
      socket.join(`kitchen_${kitchenId}`);
      console.log(`🍽 Kitchen joined room: kitchen_${kitchenId}`);
    });

    socket.on("join_delivery", (deliveryId) => {
      socket.join(`delivery_${deliveryId}`);
      console.log(`🚴 Delivery joined room: delivery_${deliveryId}`);
    });

    socket.on("join_order", (orderId) => {
      socket.join(`order_${orderId}`);
      console.log(`📦 Joined order room: order_${orderId}`);
    });

    // Create order via socket
    socket.on("create_order", async (payload, callback) => {
      try {
        const { userId, addressId, paymentMethod = 'COD' } = payload || {};

        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
          return callback && callback({ status: "error", message: "Cart is empty" });
        }

        const user = await User.findById(userId);
        const address = user?.addresses?.id(addressId);
        if (!address) {
          return callback && callback({ status: "error", message: "Invalid address" });
        }

        // Wallet deduction
        if (paymentMethod === 'WALLET') {
          if ((user.walletBalance || 0) < cart.totalAmount) {
            return callback && callback({ status: 'error', message: 'Insufficient wallet balance' });
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
            paymentStatus: paymentMethod === 'WALLET' ? 'PAID' : 'PENDING'
          },
          status: "PLACED",
          timeline: {
            placedAt: new Date()
          }
        });

        cart.items = [];
        cart.totalAmount = 0;
        await cart.save();

        io.to(`kitchen_${order.partner}`).emit("new_order", order);
        emitOrderStatusUpdate(io, order, "ORDER_RECEIVED");

        // If online, create razorpay order and return to client (client can pay later)
        let razorpayOrder = null;
        if (paymentMethod === 'ONLINE') {
          try {
            const { createOrder } = require('../utils/razorpay');
            razorpayOrder = await createOrder(Math.round((order.priceDetails?.totalAmount || 0) * 100));
          } catch (err) {
            console.error('Razorpay create order error:', err.message || err);
          }
        }

        callback && callback({ status: "ok", order, razorpayOrder });
      } catch (error) {
        console.error("create_order error:", error);
        callback && callback({ status: "error", message: error.message });
      }
    });

    // Kitchen actions via socket (ACCEPT / REJECT)
    socket.on("kitchen_action", async (payload, callback) => {
      try {
        const { orderId, action } = payload || {};
        const order = await Order.findById(orderId);
        if (!order) return callback && callback({ status: "error", message: "Order not found" });

        if (action === "ACCEPT") {
          order.status = "ACCEPTED";
          order.timeline = order.timeline || {};
          order.timeline.acceptedAt = new Date();
          await order.save();

          io.to(`user_${order.user}`).emit("order_accepted", order);
          emitOrderStatusUpdate(io, order, "ACCEPTED");

          order.timeline.preparingAt = new Date();
          await order.save();
          emitOrderStatusUpdate(io, order, "PROCESSING");

          if (typeof assignDeliveryBoy === "function") {
            await assignDeliveryBoy(order);
          }
        } else {
          order.status = "CANCELLED";
          order.timeline = order.timeline || {};
          order.timeline.cancelledAt = new Date();
          await order.save();

          // Refund wallet if used
          if (order.payment?.method === 'WALLET' && order.payment?.paymentStatus === 'PAID') {
            const u = await User.findById(order.user);
            if (u) {
              u.walletBalance = (u.walletBalance || 0) + (order.priceDetails?.totalAmount || 0);
              await u.save();
              io.to(`user_${order.user}`).emit('wallet_refunded', { orderId: order._id, amount: order.priceDetails?.totalAmount || 0 });
            }
          }

          io.to(`user_${order.user}`).emit("order_cancelled", order);
          emitOrderStatusUpdate(io, order, "CANCELLED");
        }

        callback && callback({ status: "ok", order });
      } catch (error) {
        console.error("kitchen_action error:", error);
        callback && callback({ status: "error", message: error.message });
      }
    });

    // Delivery starts (picked up)
    socket.on("delivery_start", async (payload, callback) => {
      try {
        const { orderId } = payload || {};
        const order = await Order.findById(orderId);
        if (!order) return callback && callback({ status: "error", message: "Order not found" });

        order.status = "OUT_FOR_DELIVERY";
        order.timeline = order.timeline || {};
        order.timeline.pickedAt = new Date();
        await order.save();

        io.to(`user_${order.user}`).emit("delivery_started", order);
        emitOrderStatusUpdate(io, order, "ON_ROUTE");

        callback && callback({ status: "ok", order });
      } catch (error) {
        console.error("delivery_start error:", error);
        callback && callback({ status: "error", message: error.message });
      }
    });

    // Mark delivered
    socket.on("mark_delivered", async (payload, callback) => {
      try {
        const { orderId } = payload || {};
        const order = await Order.findById(orderId);
        if (!order) return callback && callback({ status: "error", message: "Order not found" });

        order.status = "DELIVERED";
        order.payment = order.payment || {};
        // Keep ONLINE payment as pending until client confirms
        if (order.payment.method !== 'ONLINE') {
          order.payment.paymentStatus = "PAID";
        }
        order.timeline = order.timeline || {};
        order.timeline.deliveredAt = new Date();

        await order.save();

        io.to(`user_${order.user}`).emit("order_delivered", order);
        emitOrderStatusUpdate(io, order, "DELIVERED");

        if (order.payment?.method === 'ONLINE') {
          io.to(`user_${order.user}`).emit('payment_required', { orderId: order._id, amount: order.priceDetails?.totalAmount || 0 });
        }

        callback && callback({ status: "ok", order });
      } catch (error) {
        console.error("mark_delivered error:", error);
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 Socket Disconnected:", socket.id);
    });
  });
};

/* ================= EMIT FUNCTIONS ================= */

const emitOrderPicked = (order) => {
  if (!order?.user) return;
  const io = getIO();
  io.to(`user_${order.user}`).emit("order_picked", order);
};

const emitOrderDelivered = (order) => {
  if (!order?.user) return;
  const io = getIO();
  io.to(`user_${order.user}`).emit("order_delivered", order);
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
