const Order = require("../module/order.model");
const Cart = require("../module/cart.model");
const User = require("../module/user.model");
const Partner = require("../module/partner.model");
const DeliveryAgent = require("../module/Delivery_Agent");
const WalletTransaction = require("../module/walletTransaction.model");
const { createOrder: createRazorOrder, verifySignature } = require("../utils/razorpay");
const { createPaymentIntent, retrievePaymentIntent } = require("../utils/stripe");
const assignDeliveryBoy = require("../utils/deliveryAssignment");
const { notifyPartner } = require("../utils/partnerNotification");
const mongoose = require("mongoose");

const emitOrderStatusUpdate = (order, customerStatus) => {
  global.io?.to(`user_${order.user}`).emit("order_status_update", {
    orderId: order._id,
    status: customerStatus,
    internalStatus: order.status,
    timeline: order.timeline
  });
};

const USER_CANCEL_ALLOWED_STATUSES = ["PLACED", "ACCEPTED", "PREPARING", "READY"];

const apiError = (res, status, code, message, details) =>
  res.status(status).json({ statusCode: status, code, message, details });

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
const getActorIdFromReq = (req) => req?.user?.id || req?.partner?.id || req?.driver?.id;

const getActorRole = async (actorId) => {
  if (!isValidObjectId(actorId)) return null;
  const [user, partner, deliveryAgent] = await Promise.all([
    User.findById(actorId).select("_id"),
    Partner.findById(actorId).select("_id"),
    DeliveryAgent.findById(actorId).select("_id")
  ]);
  if (partner) return "PARTNER";
  if (deliveryAgent) return "DELIVERY_AGENT";
  if (user) return "USER";
  return null;
};

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

exports.createOrder = async (req, res) => {
  try {
    const userId = getActorIdFromReq(req);
    const { addressId, paymentMethod = "COD" } = req.body;
    const actorRole = await getActorRole(userId);

    if (actorRole !== "USER") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only users can create orders");
    }

    if (!isValidObjectId(addressId)) {
      return apiError(res, 400, "INVALID_ADDRESS_ID", "addressId must be a valid id");
    }

    if (!["COD", "ONLINE", "WALLET"].includes(paymentMethod)) {
      return apiError(res, 400, "INVALID_PAYMENT_METHOD", "paymentMethod must be COD, ONLINE or WALLET");
    }

    const cart = await Cart.findOne({ userId });

    if (!cart || cart.items.length === 0) {
      return apiError(res, 400, "CART_EMPTY", "Cart is empty");
    }

    const user = await User.findById(userId);
    const address = user?.addresses?.id(addressId);

    if (!address) {
      return apiError(res, 400, "ADDRESS_NOT_FOUND", "Invalid address");
    }

    const orderData = {
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
    };

    // Wallet deduction
    if (paymentMethod === "WALLET") {
      const userDoc = await User.findById(userId);
      if (!userDoc) return apiError(res, 404, "USER_NOT_FOUND", "User not found");
      if ((userDoc.walletBalance || 0) < cart.totalAmount) {
        return apiError(res, 400, "INSUFFICIENT_WALLET_BALANCE", "Insufficient wallet balance");
      }
      userDoc.walletBalance = (userDoc.walletBalance || 0) - cart.totalAmount;
      await userDoc.save();
    }

    const order = await Order.create(orderData);

    // If online payment, create a Razorpay order and return details
    let razorpayOrder = null;
    if (paymentMethod === "ONLINE") {
      try {
        // amount in paise
        razorpayOrder = await createRazorOrder(Math.round(cart.totalAmount * 100));
      } catch (err) {
        console.error("Razorpay order create failed:", err.message || err);
      }
    }

    cart.items = [];
    cart.totalAmount = 0;
    await cart.save();

    global.io?.to(`kitchen_${order.partner}`).emit("new_order", order);
    emitOrderStatusUpdate(order, "ORDER_RECEIVED");
    await notifyPartner({
      partnerId: order.partner,
      type: "NEW_ORDER",
      title: "New Order Received",
      message: `You received a new order #${order._id.toString().slice(-6)}`,
      data: { orderId: order._id, status: order.status }
    });

    return res.status(201).json({ message: "Order created successfully", order, razorpayOrder });
  } catch (error) {
    return apiError(res, 500, "ORDER_CREATE_FAILED", error.message);
  }
};

exports.kitchenAction = async (req, res) => {
  try {
    const actorId = getActorIdFromReq(req);
    const actorRole = await getActorRole(actorId);
    const { orderId } = req.params;
    const { action } = req.body;
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }
    if (!["ACCEPT", "REJECT"].includes(action)) {
      return apiError(res, 400, "INVALID_ACTION", "action must be ACCEPT or REJECT");
    }

    const order = await Order.findById(orderId);
    if (!order) return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");
    if (actorRole !== "PARTNER" || String(order.partner) !== String(actorId)) {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only assigned kitchen partner can perform this action");
    }

    if (action === "ACCEPT") {
      order.status = "ACCEPTED";
      order.timeline.acceptedAt = new Date();
      await order.save();

      global.io?.to(`user_${order.user}`).emit("order_accepted", order);
      emitOrderStatusUpdate(order, "ACCEPTED");

      order.timeline.preparingAt = new Date();
      await order.save();
      emitOrderStatusUpdate(order, "PROCESSING");

      if (typeof assignDeliveryBoy === "function") {
        await assignDeliveryBoy(order);
      }
    } else {
      order.status = "CANCELLED";
      order.timeline.cancelledAt = new Date();
      await order.save();

      // Refund wallet if paid via wallet
      if (order.payment?.method === "WALLET" && order.payment?.paymentStatus === "PAID") {
        const user = await User.findById(order.user);
        if (user) {
          user.walletBalance = (user.walletBalance || 0) + (order.priceDetails?.totalAmount || 0);
          await user.save();
          global.io?.to(`user_${order.user}`).emit("wallet_refunded", { orderId: order._id, amount: order.priceDetails?.totalAmount || 0 });
        }
      }

      global.io?.to(`user_${order.user}`).emit("order_cancelled", order);
      emitOrderStatusUpdate(order, "CANCELLED");
    }

    return res.status(200).json({ message: "Action updated", order });
  } catch (error) {
    return apiError(res, 500, "KITCHEN_ACTION_FAILED", error.message);
  }
};

exports.deliveryAction = async (req, res) => {
  try {
    const actorId = getActorIdFromReq(req);
    const actorRole = await getActorRole(actorId);
    const { orderId } = req.params;
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }
    if (actorRole !== "DELIVERY_AGENT") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only delivery agent can start delivery");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");
    }

    if (!order.deliveryAgent || String(order.deliveryAgent) !== String(actorId)) {
      return apiError(res, 403, "DELIVERY_AGENT_MISMATCH", "Order is not assigned to this delivery agent");
    }

    if (!["ACCEPTED", "READY"].includes(order.status)) {
      return apiError(res, 409, "INVALID_ORDER_STATE", "Order is not ready for delivery");
    }

    order.status = "OUT_FOR_DELIVERY";
    order.timeline.pickedAt = new Date();
    await order.save();

    global.io?.to(`user_${order.user}`).emit("delivery_started", order);
    emitOrderStatusUpdate(order, "ON_ROUTE");

    return res.status(200).json({ message: "Delivery started", order });
  } catch (error) {
    return apiError(res, 500, "DELIVERY_ACTION_FAILED", error.message);
  }
};

exports.markDelivered = async (req, res) => {
  try {
    const actorId = getActorIdFromReq(req);
    const actorRole = await getActorRole(actorId);
    const { orderId } = req.params;
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }
    if (actorRole !== "DELIVERY_AGENT") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only delivery agent can mark delivered");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");
    }
    if (!order.deliveryAgent || String(order.deliveryAgent) !== String(actorId)) {
      return apiError(res, 403, "DELIVERY_AGENT_MISMATCH", "Order is not assigned to this delivery agent");
    }
    if (order.status !== "OUT_FOR_DELIVERY") {
      return apiError(res, 409, "INVALID_ORDER_STATE", "Only OUT_FOR_DELIVERY orders can be delivered");
    }

    order.status = "DELIVERED";
    // If payment method is ONLINE, keep paymentStatus as PENDING until client confirms payment
    if (order.payment?.method !== "ONLINE") {
      order.payment = order.payment || {};
      order.payment.paymentStatus = "PAID";
    }
    order.timeline.deliveredAt = new Date();

    await order.save();

    global.io?.to(`user_${order.user}`).emit("order_delivered", order);
    emitOrderStatusUpdate(order, "DELIVERED");

    if (order.payment?.method === "ONLINE") {
      global.io?.to(`user_${order.user}`).emit("payment_required", { orderId: order._id, amount: order.priceDetails?.totalAmount || 0 });
    }

    return res.status(200).json({ message: "Order delivered successfully" });
  } catch (error) {
    return apiError(res, 500, "MARK_DELIVERED_FAILED", error.message);
  }
};

// Confirm online payment (Razorpay) and finalize order
exports.confirmPayment = async (req, res) => {
  try {
    const actorId = getActorIdFromReq(req);
    const actorRole = await getActorRole(actorId);
    if (actorRole !== "USER") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only users can confirm order payment");
    }

    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return apiError(res, 400, "PAYMENT_FIELDS_REQUIRED", "razorpay_payment_id, razorpay_order_id and razorpay_signature are required");
    }

    const order = await Order.findById(orderId);
    if (!order) return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");
    if (String(order.user) !== String(actorId)) {
      return apiError(res, 403, "ORDER_OWNERSHIP_REQUIRED", "You can only confirm payment for your own order");
    }

    const existingPaymentId = order.payment?.details?.razorpay_payment_id;
    if (order.payment?.paymentStatus === "PAID") {
      if (existingPaymentId && existingPaymentId !== razorpay_payment_id) {
        return apiError(res, 409, "PAYMENT_ALREADY_CONFIRMED", "Payment already confirmed with a different transaction id");
      }
      return res.status(200).json({ message: "Payment already confirmed", order });
    }

    const valid = verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!valid) return apiError(res, 400, "INVALID_PAYMENT_SIGNATURE", "Invalid payment signature");

    order.payment = order.payment || {};
    order.payment.paymentStatus = "PAID";
    order.payment.details = { razorpay_payment_id, razorpay_order_id };
    await order.save();

    global.io?.to(`user_${order.user}`).emit("payment_success", { orderId: order._id, paymentId: razorpay_payment_id });

    return res.json({ message: "Payment confirmed", order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const userId = getActorIdFromReq(req);
    const actorRole = await getActorRole(userId);
    if (actorRole !== "USER") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only users can view their orders");
    }
    const { status, page = 1, limit = 20 } = req.query;

    const query = { user: userId };
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
    return apiError(res, 500, "FETCH_ORDERS_FAILED", error.message);
  }
};

exports.getMyOrderDetails = async (req, res) => {
  try {
    const userId = getActorIdFromReq(req);
    const actorRole = await getActorRole(userId);
    if (actorRole !== "USER") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only users can view order details");
    }
    const { orderId } = req.params;
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate("partner", "kitchenName address phone")
      .populate("items.menuItem", "name description image price");

    if (!order) {
      return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");
    }

    return res.status(200).json({
      message: "Order details fetched successfully",
      data: order
    });
  } catch (error) {
    return apiError(res, 500, "FETCH_ORDER_DETAILS_FAILED", error.message);
  }
};

exports.cancelMyOrder = async (req, res) => {
  try {
    const userId = getActorIdFromReq(req);
    const actorRole = await getActorRole(userId);
    if (actorRole !== "USER") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only users can cancel their orders");
    }
    const { orderId } = req.params;
    const { reason = "Cancelled by customer" } = req.body || {};
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");
    }

    if (!USER_CANCEL_ALLOWED_STATUSES.includes(order.status)) {
      return apiError(res, 409, "ORDER_CANCEL_NOT_ALLOWED", `Order cannot be cancelled at status ${order.status}`);
    }

    order.status = "CANCELLED";
    order.timeline.cancelledAt = new Date();
    order.cancellation = {
      cancelledBy: "USER",
      reason
    };

    await order.save();

    if (order.payment?.method === "WALLET" && order.payment?.paymentStatus === "PAID") {
      const user = await User.findById(userId);
      if (user) {
        const refundAmount = order.priceDetails?.totalAmount || 0;
        user.walletBalance = (user.walletBalance || 0) + refundAmount;
        await user.save();
        global.io?.to(`user_${order.user}`).emit("wallet_refunded", { orderId: order._id, amount: refundAmount });
      }
    }

    global.io?.to(`kitchen_${order.partner}`).emit("order_cancelled_by_user", {
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
    global.io?.to(`user_${order.user}`).emit("order_cancelled", order);
    emitOrderStatusUpdate(order, "CANCELLED");

    return res.status(200).json({
      message: "Order cancelled successfully",
      data: order
    });
  } catch (error) {
    return apiError(res, 500, "CANCEL_ORDER_FAILED", error.message);
  }
};

exports.rateOrder = async (req, res) => {
  try {
    const userId = getActorIdFromReq(req);
    const actorRole = await getActorRole(userId);
    if (actorRole !== "USER") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only users can rate orders");
    }
    const { orderId } = req.params;
    const { partnerRating, deliveryRating, review } = req.body;
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");
    }

    if (order.status !== "DELIVERED") {
      return apiError(res, 409, "INVALID_ORDER_STATE", "Only delivered orders can be rated");
    }

    if (partnerRating !== undefined) {
      if (Number(partnerRating) < 1 || Number(partnerRating) > 5) {
        return apiError(res, 400, "INVALID_PARTNER_RATING", "partnerRating must be between 1 and 5");
      }
      order.rating.partnerRating = Number(partnerRating);
    }

    if (deliveryRating !== undefined) {
      if (Number(deliveryRating) < 1 || Number(deliveryRating) > 5) {
        return apiError(res, 400, "INVALID_DELIVERY_RATING", "deliveryRating must be between 1 and 5");
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

    return res.status(200).json({
      message: "Order rating submitted successfully",
      data: order.rating
    });
  } catch (error) {
    return apiError(res, 500, "RATE_ORDER_FAILED", error.message);
  }
};

exports.addTipToOrder = async (req, res) => {
  try {
    const userId = getActorIdFromReq(req);
    const actorRole = await getActorRole(userId);
    if (actorRole !== "USER") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only users can add tips");
    }
    const { orderId } = req.params;
    const { amount, paymentMethod = "WALLET" } = req.body;
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }

    const tipAmount = Number(amount);
    if (!tipAmount || tipAmount <= 0) {
      return apiError(res, 400, "INVALID_TIP_AMOUNT", "Valid tip amount is required");
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");

    if (!["OUT_FOR_DELIVERY", "DELIVERED"].includes(order.status)) {
      return apiError(res, 409, "INVALID_ORDER_STATE", "Tip can be added only when order is on-route or delivered");
    }

    if (order.tip?.paymentStatus === "PAID") {
      return apiError(res, 409, "TIP_ALREADY_PAID", "Tip already paid for this order");
    }

    if (paymentMethod === "WALLET") {
      const user = await User.findById(userId);
      if (!user) return apiError(res, 404, "USER_NOT_FOUND", "User not found");
      if ((user.walletBalance || 0) < tipAmount) {
        return apiError(res, 400, "INSUFFICIENT_WALLET_BALANCE", "Insufficient wallet balance");
      }

      const before = user.walletBalance || 0;
      user.walletBalance = before - tipAmount;
      await user.save();

      await createWalletLedgerEntry({
        userId,
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

      if (order.deliveryAgent) {
        const agent = await DeliveryAgent.findById(order.deliveryAgent);
        if (agent) {
          agent.earnings.today = (agent.earnings.today || 0) + tipAmount;
          agent.earnings.total = (agent.earnings.total || 0) + tipAmount;
          await agent.save();
        }
      }

      return res.status(200).json({
        message: "Tip added successfully",
        data: order.tip
      });
    }

    if (paymentMethod === "RAZORPAY") {
      const razorpayOrder = await createRazorOrder(Math.round(tipAmount * 100));
      order.tip = {
        amount: tipAmount,
        paymentMethod: "RAZORPAY",
        paymentStatus: "PENDING",
        gatewayOrderId: razorpayOrder.id
      };
      await order.save();

      return res.status(200).json({
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
          userId: String(userId),
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

      return res.status(200).json({
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

    return apiError(res, 400, "INVALID_PAYMENT_METHOD", "Invalid paymentMethod");
  } catch (error) {
    return apiError(res, 500, "ADD_TIP_FAILED", error.message);
  }
};

exports.confirmTipPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const actorRole = await getActorRole(userId);
    if (actorRole !== "USER") {
      return apiError(res, 403, "ROLE_NOT_ALLOWED", "Only users can confirm tip payment");
    }
    const { orderId } = req.params;
    const {
      gateway,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      stripe_payment_intent_id
    } = req.body;
    if (!isValidObjectId(orderId)) {
      return apiError(res, 400, "INVALID_ORDER_ID", "orderId must be a valid id");
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return apiError(res, 404, "ORDER_NOT_FOUND", "Order not found");

    if (!order.tip || order.tip.paymentStatus !== "PENDING") {
      if (order.tip?.paymentStatus === "PAID") {
        return res.status(200).json({
          message: "Tip payment already confirmed",
          data: order.tip
        });
      }
      return apiError(res, 400, "NO_PENDING_TIP_PAYMENT", "No pending tip payment found");
    }

    if (gateway === "RAZORPAY") {
      const valid = verifySignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });
      if (!valid) {
        return apiError(res, 400, "INVALID_PAYMENT_SIGNATURE", "Invalid Razorpay signature");
      }
      if (order.tip.gatewayOrderId && order.tip.gatewayOrderId !== razorpay_order_id) {
        return apiError(res, 409, "PAYMENT_GATEWAY_MISMATCH", "Razorpay order id mismatch");
      }

      order.tip.paymentStatus = "PAID";
      order.tip.gatewayOrderId = razorpay_order_id;
      order.tip.gatewayPaymentId = razorpay_payment_id;
      order.tip.tippedAt = new Date();
      await order.save();
    } else if (gateway === "STRIPE") {
      const paymentIntent = await retrievePaymentIntent(stripe_payment_intent_id);
      if (!paymentIntent || paymentIntent.status !== "succeeded") {
        return apiError(res, 400, "STRIPE_PAYMENT_NOT_SUCCESSFUL", "Stripe payment not successful");
      }
      if (order.tip.gatewayOrderId && order.tip.gatewayOrderId !== stripe_payment_intent_id) {
        return apiError(res, 409, "PAYMENT_GATEWAY_MISMATCH", "Stripe payment intent mismatch");
      }

      order.tip.paymentStatus = "PAID";
      order.tip.gatewayOrderId = stripe_payment_intent_id;
      order.tip.gatewayPaymentId = stripe_payment_intent_id;
      order.tip.tippedAt = new Date();
      await order.save();
    } else {
      return apiError(res, 400, "INVALID_GATEWAY", "Invalid gateway");
    }

    if (order.deliveryAgent) {
      const agent = await DeliveryAgent.findById(order.deliveryAgent);
      if (agent) {
        const tipAmount = Number(order.tip?.amount || 0);
        agent.earnings.today = (agent.earnings.today || 0) + tipAmount;
        agent.earnings.total = (agent.earnings.total || 0) + tipAmount;
        await agent.save();
      }
    }

    return res.status(200).json({
      message: "Tip payment confirmed",
      data: order.tip
    });
  } catch (error) {
    return apiError(res, 500, "CONFIRM_TIP_PAYMENT_FAILED", error.message);
  }
};
