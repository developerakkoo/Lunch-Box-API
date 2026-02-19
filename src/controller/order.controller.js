const Order = require("../module/order.model");
const Cart = require("../module/cart.model");
const User = require("../module/user.model");
const DeliveryAgent = require("../module/Delivery_Agent");
const WalletTransaction = require("../module/walletTransaction.model");
const { createOrder: createRazorOrder, verifySignature } = require("../utils/razorpay");
const { createPaymentIntent, retrievePaymentIntent } = require("../utils/stripe");
const assignDeliveryBoy = require("../utils/deliveryAssignment");

const emitOrderStatusUpdate = (order, customerStatus) => {
  global.io?.to(`user_${order.user}`).emit("order_status_update", {
    orderId: order._id,
    status: customerStatus,
    internalStatus: order.status,
    timeline: order.timeline
  });
};

const USER_CANCEL_ALLOWED_STATUSES = ["PLACED", "ACCEPTED", "PREPARING", "READY"];

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
    const userId = req.user.id;
    const { addressId, paymentMethod = "COD" } = req.body;

    const cart = await Cart.findOne({ userId });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const user = await User.findById(userId);
    const address = user?.addresses?.id(addressId);

    if (!address) {
      return res.status(400).json({ message: "Invalid address" });
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
      if (!userDoc) return res.status(404).json({ message: "User not found" });
      if ((userDoc.walletBalance || 0) < cart.totalAmount) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
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

    return res.json({ message: "Order created successfully", order, razorpayOrder });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.kitchenAction = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

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

    return res.json({ message: "Action updated", order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deliveryAction = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = "OUT_FOR_DELIVERY";
    order.timeline.pickedAt = new Date();
    await order.save();

    global.io?.to(`user_${order.user}`).emit("delivery_started", order);
    emitOrderStatusUpdate(order, "ON_ROUTE");

    return res.json({ message: "Delivery started", order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markDelivered = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
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

    return res.json({ message: "Order delivered successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Confirm online payment (Razorpay) and finalize order
exports.confirmPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const valid = verifySignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature });
    if (!valid) return res.status(400).json({ message: "Invalid payment signature" });

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
    const userId = req.user.id;
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
    return res.status(500).json({ message: error.message });
  }
};

exports.getMyOrderDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate("partner", "kitchenName address phone")
      .populate("items.menuItem", "name description image price");

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

exports.cancelMyOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const { reason = "Cancelled by customer" } = req.body || {};

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!USER_CANCEL_ALLOWED_STATUSES.includes(order.status)) {
      return res.status(400).json({
        message: `Order cannot be cancelled at status ${order.status}`
      });
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
    global.io?.to(`user_${order.user}`).emit("order_cancelled", order);
    emitOrderStatusUpdate(order, "CANCELLED");

    return res.status(200).json({
      message: "Order cancelled successfully",
      data: order
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.rateOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const { partnerRating, deliveryRating, review } = req.body;

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== "DELIVERED") {
      return res.status(400).json({ message: "Only delivered orders can be rated" });
    }

    if (partnerRating !== undefined) {
      if (Number(partnerRating) < 1 || Number(partnerRating) > 5) {
        return res.status(400).json({ message: "partnerRating must be between 1 and 5" });
      }
      order.rating.partnerRating = Number(partnerRating);
    }

    if (deliveryRating !== undefined) {
      if (Number(deliveryRating) < 1 || Number(deliveryRating) > 5) {
        return res.status(400).json({ message: "deliveryRating must be between 1 and 5" });
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
    return res.status(500).json({ message: error.message });
  }
};

exports.addTipToOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const { amount, paymentMethod = "WALLET" } = req.body;

    const tipAmount = Number(amount);
    if (!tipAmount || tipAmount <= 0) {
      return res.status(400).json({ message: "Valid tip amount is required" });
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!["OUT_FOR_DELIVERY", "DELIVERED"].includes(order.status)) {
      return res.status(400).json({ message: "Tip can be added only when order is on-route or delivered" });
    }

    if (order.tip?.paymentStatus === "PAID") {
      return res.status(400).json({ message: "Tip already paid for this order" });
    }

    if (paymentMethod === "WALLET") {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if ((user.walletBalance || 0) < tipAmount) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
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

    return res.status(400).json({ message: "Invalid paymentMethod" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.confirmTipPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const {
      gateway,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      stripe_payment_intent_id
    } = req.body;

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!order.tip || order.tip.paymentStatus !== "PENDING") {
      return res.status(400).json({ message: "No pending tip payment found" });
    }

    if (gateway === "RAZORPAY") {
      const valid = verifySignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });
      if (!valid) {
        return res.status(400).json({ message: "Invalid Razorpay signature" });
      }
      if (order.tip.gatewayOrderId && order.tip.gatewayOrderId !== razorpay_order_id) {
        return res.status(400).json({ message: "Razorpay order id mismatch" });
      }

      order.tip.paymentStatus = "PAID";
      order.tip.gatewayOrderId = razorpay_order_id;
      order.tip.gatewayPaymentId = razorpay_payment_id;
      order.tip.tippedAt = new Date();
      await order.save();
    } else if (gateway === "STRIPE") {
      const paymentIntent = await retrievePaymentIntent(stripe_payment_intent_id);
      if (!paymentIntent || paymentIntent.status !== "succeeded") {
        return res.status(400).json({ message: "Stripe payment not successful" });
      }
      if (order.tip.gatewayOrderId && order.tip.gatewayOrderId !== stripe_payment_intent_id) {
        return res.status(400).json({ message: "Stripe payment intent mismatch" });
      }

      order.tip.paymentStatus = "PAID";
      order.tip.gatewayOrderId = stripe_payment_intent_id;
      order.tip.gatewayPaymentId = stripe_payment_intent_id;
      order.tip.tippedAt = new Date();
      await order.save();
    } else {
      return res.status(400).json({ message: "Invalid gateway" });
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
    return res.status(500).json({ message: error.message });
  }
};
