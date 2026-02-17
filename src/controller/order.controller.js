const Order = require("../module/order.model");
const Cart = require("../module/cart.model");
const User = require("../module/user.model");
const { createOrder: createRazorOrder, verifySignature } = require("../utils/razorpay");
const assignDeliveryBoy = require("../utils/deliveryAssignment");

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
