const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { getIO } = require("./socket");
const Order = require("../module/order.model");
const Cart = require("../module/cart.model");
const User = require("../module/user.model");
const DeliveryAgent = require("../module/Delivery_Agent");
const WalletTransaction = require("../module/walletTransaction.model");
const assignDeliveryBoy = require("../utils/deliveryAssignment");
const { notifyPartner } = require("../utils/partnerNotification");
const { createOrder: createRazorpayOrder, verifySignature } = require("../utils/razorpay");
const { createPaymentIntent, retrievePaymentIntent } = require("../utils/stripe");
const { getManagedHotelIds } = require("../utils/partnerAccess");
const logger = require("../utils/logger");
const {
  clearDriverAssignment,
  publishOrderEvent,
  removeDriverReadyOrder
} = require("../utils/orderEvents");

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

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const apiError = (message, details = {}) => ({
  status: "error",
  message,
  ...details
});

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
    return { error: apiError("Unauthorized socket action") };
  }
  return { actor };
};

const resolveOrderForUser = async (userId, orderId) => {
  if (!isValidObjectId(orderId)) return null;
  return Order.findOne({ _id: orderId, user: userId });
};

const resolveOrderForPartner = async (partnerId, orderId) => {
  if (!isValidObjectId(orderId)) return null;
  const { hotelIds } = await getManagedHotelIds(partnerId);
  return Order.findOne({ _id: orderId, partner: { $in: hotelIds } });
};

const refundWalletIfEligible = async ({ order, userId, io }) => {
  if (order.payment?.method !== "WALLET" || order.payment?.paymentStatus !== "PAID") {
    return;
  }

  const user = await User.findById(userId);
  if (!user) return;

  const refundAmount = Number(order.priceDetails?.totalAmount || 0);
  user.walletBalance = (user.walletBalance || 0) + refundAmount;
  await user.save();

  io.to(`user_${order.user}`).emit("wallet_refunded", {
    orderId: order._id,
    amount: refundAmount
  });
};

const awardDriverTip = async (order, tipAmount) => {
  if (!order.deliveryAgent) return;

  const agent = await DeliveryAgent.findById(order.deliveryAgent);
  if (!agent) return;

  agent.earnings.today = (agent.earnings.today || 0) + tipAmount;
  agent.earnings.total = (agent.earnings.total || 0) + tipAmount;
  await agent.save();
};

const orderSocketHandler = () => {
  const io = getIO();
  logger.info("Order socket handler initialized");

  io.on("connection", (socket) => {
    logger.info("Socket connected", { socketId: socket.id });

    socket.on("join_user", async (userId, callback) => {
      logger.debug("join_user request", { socketId: socket.id, userId });
      const { actor, error } = await requireActor(socket, ["USER"]);
      if (error) return callback && callback(error);
      if (String(actor.id) !== String(userId)) {
        logger.warn("join_user rejected", { socketId: socket.id, actorId: actor.id, userId });
        return callback && callback({ status: "error", message: "Cannot join another user room" });
      }
      socket.join(`user_${userId}`);
      logger.info("User joined room", { socketId: socket.id, userId });
      callback && callback({ status: "ok" });
    });

    socket.on("join_kitchen", async (kitchenId, callback) => {
      logger.debug("join_kitchen request", { socketId: socket.id, kitchenId });
      const { actor, error } = await requireActor(socket, ["PARTNER"]);
      if (error) return callback && callback(error);
      const { hotelIds } = await getManagedHotelIds(actor.id);
      if (!hotelIds.includes(String(kitchenId))) {
        logger.warn("join_kitchen rejected", { socketId: socket.id, actorId: actor.id, kitchenId });
        return callback && callback({ status: "error", message: "Cannot join another kitchen room" });
      }
      socket.join(`kitchen_${kitchenId}`);
      logger.info("Kitchen joined room", { socketId: socket.id, kitchenId });
      callback && callback({ status: "ok" });
    });

    socket.on("join_delivery", async (deliveryId, callback) => {
      logger.debug("join_delivery request", { socketId: socket.id, deliveryId });
      const { actor, error } = await requireActor(socket, ["DELIVERY_AGENT"]);
      if (error) return callback && callback(error);
      if (String(actor.id) !== String(deliveryId)) {
        logger.warn("join_delivery rejected", { socketId: socket.id, actorId: actor.id, deliveryId });
        return callback && callback({ status: "error", message: "Cannot join another delivery room" });
      }
      socket.join(`delivery_${deliveryId}`);
      logger.info("Delivery room joined", { socketId: socket.id, deliveryId });
      callback && callback({ status: "ok" });
    });

    socket.on("join_order", async (orderId, callback) => {
      logger.debug("join_order request", { socketId: socket.id, orderId });
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
        logger.warn("join_order denied", { socketId: socket.id, orderId, role: actor.role });
        return callback && callback({ status: "error", message: "Order room access denied" });
      }

      socket.join(`order_${orderId}`);
      logger.info("Order room joined", { socketId: socket.id, orderId, role: actor.role });
      callback && callback({ status: "ok" });
    });

    socket.on("create_order", async (payload, callback) => {
      try {
        logger.info("create_order event received", { socketId: socket.id });
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { addressId, paymentMethod = "COD" } = payload || {};
        const userId = actor.id;

        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
          logger.warn("create_order rejected: cart empty", { userId });
          return callback && callback({ status: "error", message: "Cart is empty" });
        }

        const user = await User.findById(userId);
        const address = user?.addresses?.id(addressId);
        if (!address) {
          logger.warn("create_order rejected: invalid address", { userId, addressId });
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
        logger.info("Order created", { orderId: order._id, userId, partnerId: order.partner, paymentMethod });

        let razorpayOrder = null;
        if (paymentMethod === "ONLINE") {
          razorpayOrder = await createRazorpayOrder(Math.round((order.priceDetails?.totalAmount || 0) * 100));
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
        await publishOrderEvent({
          type: "ORDER_CREATED",
          order
        });

        callback && callback({ status: "ok", order, razorpayOrder });
      } catch (error) {
        logger.error("create_order failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("confirm_payment", async (payload, callback) => {
      try {
        logger.info("confirm_payment received", { socketId: socket.id, orderId: payload?.orderId });
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = payload || {};
        if (!isValidObjectId(orderId)) {
          return callback && callback(apiError("Order id must be a valid id"));
        }
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
          return callback &&
            callback(apiError("razorpay_payment_id, razorpay_order_id and razorpay_signature are required"));
        }

        const order = await Order.findById(orderId);
        if (!order) return callback && callback(apiError("Order not found"));
        if (String(order.user) !== String(actor.id)) {
          return callback && callback(apiError("You can only confirm payment for your own order"));
        }
        if (order.payment?.method !== "ONLINE") {
          return callback && callback(apiError("Only online orders require payment confirmation"));
        }
        if (order.status === "CANCELLED") {
          return callback && callback(apiError("Cancelled orders cannot be paid"));
        }

        const existingPaymentId = order.payment?.gatewayPaymentId;
        if (order.payment?.paymentStatus === "PAID") {
          if (existingPaymentId && existingPaymentId !== razorpay_payment_id) {
            return callback && callback(apiError("Payment already confirmed with a different transaction id"));
          }
          return callback && callback({ status: "ok", message: "Payment already confirmed", order });
        }

        const valid = verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
        if (!valid) {
          return callback && callback(apiError("Invalid payment signature"));
        }
        if (order.payment?.gatewayOrderId && order.payment.gatewayOrderId !== razorpay_order_id) {
          return callback && callback(apiError("Razorpay order id mismatch"));
        }

        order.payment = order.payment || {};
        order.payment.paymentStatus = "PAID";
        order.payment.gatewayOrderId = razorpay_order_id;
        order.payment.gatewayPaymentId = razorpay_payment_id;
        order.payment.gatewaySignature = razorpay_signature;
        order.payment.transactionId = razorpay_payment_id;
        await order.save();

        io.to(`user_${order.user}`).emit("payment_success", { orderId: order._id, paymentId: razorpay_payment_id });
        io.to(`kitchen_${order.partner}`).emit("payment_confirmed", {
          orderId: order._id,
          paymentId: razorpay_payment_id
        });
        await publishOrderEvent({
          type: "PAYMENT_CONFIRMED",
          order,
          paymentId: razorpay_payment_id
        });

        callback && callback({ status: "ok", message: "Payment confirmed", order });
      } catch (error) {
        logger.error("confirm_payment failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("kitchen_action", async (payload, callback) => {
      try {
        logger.info("kitchen_action received", { socketId: socket.id, action: payload?.action, orderId: payload?.orderId });
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
          logger.info("Kitchen accepted order", { orderId: order._id, partnerId: order.partner });
          io.to(`user_${order.user}`).emit("order_accepted", order);
          await publishOrderEvent({
            type: "ORDER_ACCEPTED",
            order
          });
        } else if (action === "PREPARING") {
          if (!["ACCEPTED", "PREPARING"].includes(order.status)) {
            return callback && callback({ status: "error", message: "Order cannot move to preparing" });
          }
          order.status = "PREPARING";
          order.timeline.preparingAt = order.timeline.preparingAt || new Date();
          await order.save();
          logger.info("Kitchen marked preparing", { orderId: order._id, partnerId: order.partner });
          io.to(`user_${order.user}`).emit("order_preparing", order);
          await publishOrderEvent({
            type: "ORDER_PREPARING",
            order
          });
        } else if (action === "READY") {
          if (!["PREPARING", "READY"].includes(order.status)) {
            return callback && callback({ status: "error", message: "Order cannot move to ready" });
          }
          order.status = "READY";
          order.timeline.readyAt = new Date();
          await order.save();
          logger.info("Kitchen marked ready", { orderId: order._id, partnerId: order.partner });
          io.to(`user_${order.user}`).emit("order_ready", order);
          await publishOrderEvent({
            type: "ORDER_READY",
            order
          });
          if (!order.deliveryAgent) {
            await assignDeliveryBoy(order);
          } else {
            await removeDriverReadyOrder(order._id);
          }
        } else if (action === "REJECT") {
          order.status = "CANCELLED";
          order.timeline.cancelledAt = new Date();
          await order.save();
          logger.warn("Kitchen rejected order", { orderId: order._id, partnerId: order.partner });
          await refundWalletIfEligible({ order, userId: order.user, io });
          io.to(`user_${order.user}`).emit("order_cancelled", order);
          await publishOrderEvent({
            type: "ORDER_CANCELLED",
            order,
            cancelledBy: "PARTNER",
            reason: "Rejected by partner"
          });
          if (order.deliveryAgent) {
            await DeliveryAgent.findByIdAndUpdate(order.deliveryAgent, {
              $set: {
                currentOrder: null,
                isAvailable: true
              }
            });
            await clearDriverAssignment(order.deliveryAgent);
          }
        } else {
          return callback && callback({ status: "error", message: "Invalid action" });
        }

        emitOrderStatusUpdate(io, order);
        callback && callback({ status: "ok", order });
      } catch (error) {
        logger.error("kitchen_action failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("cancel_order", async (payload, callback) => {
      try {
        logger.info("cancel_order received", { socketId: socket.id, orderId: payload?.orderId });
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { orderId, reason = "Cancelled by customer" } = payload || {};
        const order = await resolveOrderForUser(actor.id, orderId);
        if (!order) return callback && callback(apiError("Order not found"));

        if (!["PLACED", "ACCEPTED", "PREPARING", "READY"].includes(order.status)) {
          return callback && callback(apiError(`Order cannot be cancelled at status ${order.status}`));
        }

        order.status = "CANCELLED";
        order.timeline.cancelledAt = new Date();
        order.cancellation = {
          cancelledBy: "USER",
          reason
        };
        await order.save();

        await refundWalletIfEligible({ order, userId: actor.id, io });

        io.to(`kitchen_${order.partner}`).emit("order_cancelled_by_user", {
          orderId: order._id,
          reason
        });
        await notifyPartner({
          partnerId: order.partner,
          type: "ORDER_CANCELLED",
          title: "Order Cancelled",
          message: `Order #${order._id.toString().slice(-6)} was cancelled by customer`,
          data: { orderId: order._id, reason }
        });
        io.to(`user_${order.user}`).emit("order_cancelled", order);
        emitOrderStatusUpdate(io, order);
        await publishOrderEvent({
          type: "ORDER_CANCELLED",
          order,
          cancelledBy: "USER",
          reason
        });

        if (order.deliveryAgent) {
          await DeliveryAgent.findByIdAndUpdate(order.deliveryAgent, {
            $set: {
              currentOrder: null,
              isAvailable: true
            }
          });
          await clearDriverAssignment(order.deliveryAgent);
        }

        callback && callback({ status: "ok", message: "Order cancelled successfully", order });
      } catch (error) {
        logger.error("cancel_order failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("delivery_start", async (payload, callback) => {
      try {
        logger.info("delivery_start received", { socketId: socket.id, orderId: payload?.orderId });
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
        logger.info("Delivery started", { orderId: order._id, driverId: actor.id });

        io.to(`user_${order.user}`).emit("delivery_started", order);
        await removeDriverReadyOrder(order._id);
        await publishOrderEvent({
          type: "ORDER_PICKED",
          order
        });
        emitOrderStatusUpdate(io, order);
        callback && callback({ status: "ok", order });
      } catch (error) {
        logger.error("delivery_start failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("rate_order", async (payload, callback) => {
      try {
        logger.info("rate_order received", { socketId: socket.id, orderId: payload?.orderId });
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { orderId, partnerRating, deliveryRating, review } = payload || {};
        const order = await resolveOrderForUser(actor.id, orderId);
        if (!order) return callback && callback(apiError("Order not found"));
        if (order.status !== "DELIVERED") {
          return callback && callback(apiError("Only delivered orders can be rated"));
        }

        if (partnerRating !== undefined) {
          if (Number(partnerRating) < 1 || Number(partnerRating) > 5) {
            return callback && callback(apiError("partnerRating must be between 1 and 5"));
          }
          order.rating.partnerRating = Number(partnerRating);
        }

        if (deliveryRating !== undefined) {
          if (Number(deliveryRating) < 1 || Number(deliveryRating) > 5) {
            return callback && callback(apiError("deliveryRating must be between 1 and 5"));
          }
          order.rating.deliveryRating = Number(deliveryRating);

          if (order.deliveryAgent) {
            const agent = await DeliveryAgent.findById(order.deliveryAgent);
            if (agent) {
              const prevAvg = agent.rating?.averageRating || 0;
              const prevCount = agent.rating?.totalRatings || 0;
              const nextCount = prevCount + 1;
              const nextAvg = ((prevAvg * prevCount) + Number(deliveryRating)) / nextCount;
              agent.rating.averageRating = Number(nextAvg.toFixed(2));
              agent.rating.totalRatings = nextCount;
              await agent.save();
            }
          }
        }

        if (review !== undefined) {
          order.rating.review = review;
        }

        await order.save();

        callback && callback({ status: "ok", message: "Order rating submitted successfully", data: order.rating });
      } catch (error) {
        logger.error("rate_order failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("add_tip_to_order", async (payload, callback) => {
      try {
        logger.info("add_tip_to_order received", { socketId: socket.id, orderId: payload?.orderId, paymentMethod: payload?.paymentMethod });
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { orderId, amount, paymentMethod = "WALLET" } = payload || {};
        const order = await resolveOrderForUser(actor.id, orderId);
        if (!order) return callback && callback(apiError("Order not found"));

        const tipAmount = Number(amount);
        if (!tipAmount || tipAmount <= 0) {
          return callback && callback(apiError("Valid tip amount is required"));
        }

        if (!["OUT_FOR_DELIVERY", "DELIVERED"].includes(order.status)) {
          return callback && callback(apiError("Tip can be added only when order is on-route or delivered"));
        }

        if (order.tip?.paymentStatus === "PAID") {
          return callback && callback(apiError("Tip already paid for this order"));
        }

        if (paymentMethod === "WALLET") {
          const user = await User.findById(actor.id);
          if (!user) return callback && callback(apiError("User not found"));
          if ((user.walletBalance || 0) < tipAmount) {
            return callback && callback(apiError("Insufficient wallet balance"));
          }

          const before = user.walletBalance || 0;
          user.walletBalance = before - tipAmount;
          await user.save();

          await createWalletLedgerEntry({
            userId: actor.id,
            type: "DEBIT",
            source: "TIP",
            amount: tipAmount,
            balanceBefore: before,
            balanceAfter: user.walletBalance,
            gateway: "WALLET",
            referenceType: "Order",
            referenceId: order._id,
            notes: "Tip paid with wallet"
          });

          order.tip = {
            amount: tipAmount,
            paymentMethod: "WALLET",
            paymentStatus: "PAID",
            tippedAt: new Date()
          };
          await order.save();

          await awardDriverTip(order, tipAmount);

          return callback && callback({ status: "ok", message: "Tip added successfully", data: order.tip });
        }

        if (paymentMethod === "RAZORPAY") {
          const razorpayOrder = await createRazorpayOrder(Math.round(tipAmount * 100));
          order.tip = {
            amount: tipAmount,
            paymentMethod: "RAZORPAY",
            paymentStatus: "PENDING",
            gatewayOrderId: razorpayOrder.id
          };
          await order.save();

          return callback && callback({
            status: "ok",
            message: "Complete tip payment to confirm",
            data: order.tip,
            razorpayOrder
          });
        }

        if (paymentMethod === "STRIPE") {
          const paymentIntent = await createPaymentIntent({
            amount: Math.round(tipAmount * 100),
            currency: "inr",
            metadata: {
              orderId: String(order._id),
              userId: String(actor.id),
              type: "TIP"
            }
          });

          order.tip = {
            amount: tipAmount,
            paymentMethod: "STRIPE",
            paymentStatus: "PENDING",
            gatewayOrderId: paymentIntent.id
          };
          await order.save();

          return callback && callback({
            status: "ok",
            message: "Complete tip payment to confirm",
            data: order.tip,
            stripePaymentIntent: {
              id: paymentIntent.id,
              clientSecret: paymentIntent.client_secret,
              amount: paymentIntent.amount,
              currency: paymentIntent.currency
            }
          });
        }

        return callback && callback(apiError("Invalid paymentMethod"));
      } catch (error) {
        logger.error("add_tip_to_order failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("confirm_tip_payment", async (payload, callback) => {
      try {
        logger.info("confirm_tip_payment received", { socketId: socket.id, orderId: payload?.orderId, gateway: payload?.gateway });
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { orderId, gateway, razorpay_payment_id, razorpay_order_id, razorpay_signature, stripe_payment_intent_id } = payload || {};
        const order = await resolveOrderForUser(actor.id, orderId);
        if (!order) return callback && callback(apiError("Order not found"));

        if (!order.tip || order.tip.paymentStatus !== "PENDING") {
          if (order.tip?.paymentStatus === "PAID") {
            return callback && callback({ status: "ok", message: "Tip payment already confirmed", data: order.tip });
          }
          return callback && callback(apiError("No pending tip payment found"));
        }

        if (gateway === "RAZORPAY") {
          const valid = verifySignature({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
          });
          if (!valid) return callback && callback(apiError("Invalid Razorpay signature"));
          if (order.tip.gatewayOrderId && order.tip.gatewayOrderId !== razorpay_order_id) {
            return callback && callback(apiError("Razorpay order id mismatch"));
          }

          order.tip.paymentStatus = "PAID";
          order.tip.gatewayOrderId = razorpay_order_id;
          order.tip.gatewayPaymentId = razorpay_payment_id;
          order.tip.tippedAt = new Date();
          await order.save();
        } else if (gateway === "STRIPE") {
          const paymentIntent = await retrievePaymentIntent(stripe_payment_intent_id);
          if (!paymentIntent || paymentIntent.status !== "succeeded") {
            return callback && callback(apiError("Stripe payment not successful"));
          }
          if (order.tip.gatewayOrderId && order.tip.gatewayOrderId !== stripe_payment_intent_id) {
            return callback && callback(apiError("Stripe payment intent mismatch"));
          }

          order.tip.paymentStatus = "PAID";
          order.tip.gatewayOrderId = stripe_payment_intent_id;
          order.tip.gatewayPaymentId = stripe_payment_intent_id;
          order.tip.tippedAt = new Date();
          await order.save();
        } else {
          return callback && callback(apiError("Invalid gateway"));
        }

        await awardDriverTip(order, Number(order.tip?.amount || 0));

        callback && callback({ status: "ok", message: "Tip payment confirmed", data: order.tip });
      } catch (error) {
        logger.error("confirm_tip_payment failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("get_my_orders", async (payload, callback) => {
      try {
        logger.info("get_my_orders received", { socketId: socket.id });
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { status, page = 1, limit = 20 } = payload || {};
        const query = { user: actor.id };
        if (status) query.status = status;

        const pageNumber = Math.max(Number(page) || 1, 1);
        const limitNumber = Math.max(Number(limit) || 20, 1);

        const [orders, total] = await Promise.all([
          Order.find(query)
            .populate("partner", "kitchenName address")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * limitNumber)
            .limit(limitNumber),
          Order.countDocuments(query)
        ]);

        callback &&
          callback({
            status: "ok",
            message: "Orders fetched successfully",
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total
            },
            data: orders
          });
      } catch (error) {
        logger.error("get_my_orders failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("get_my_order_details", async (payload, callback) => {
      try {
        logger.info("get_my_order_details received", { socketId: socket.id, orderId: payload?.orderId });
        const { actor, error } = await requireActor(socket, ["USER"]);
        if (error) return callback && callback(error);

        const { orderId } = payload || {};
        if (!isValidObjectId(orderId)) {
          return callback && callback(apiError("Order id must be a valid id"));
        }

        const order = await Order.findOne({ _id: orderId, user: actor.id })
          .populate("partner", "kitchenName address phone")
          .populate("items.menuItem", "name description image price");

        if (!order) {
          return callback && callback(apiError("Order not found"));
        }

        callback &&
          callback({
            status: "ok",
            message: "Order details fetched successfully",
            data: order
          });
      } catch (error) {
        logger.error("get_my_order_details failed", { socketId: socket.id, message: error.message });
        callback && callback({ status: "error", message: error.message });
      }
    });

    socket.on("mark_delivered", async (payload, callback) => {
      try {
        logger.info("mark_delivered received", { socketId: socket.id, orderId: payload?.orderId });
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
        logger.info("Order delivered", { orderId: order._id, driverId: actor.id });

        io.to(`user_${order.user}`).emit("order_delivered", order);
        await clearDriverAssignment(actor.id);
        await publishOrderEvent({
          type: "ORDER_DELIVERED",
          order
        });
        emitOrderStatusUpdate(io, order);
        callback && callback({ status: "ok", order });
      } catch (error) {
        logger.error("mark_delivered failed", { socketId: socket.id, message: error.message });
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
