const Cart = require("../module/cart.model");
const MenuItem = require("../module/menuItem.model");
const Coupon = require("../module/coupon.model");

const logCartWarning = (message, details = {}) => {
  console.warn(`[cart] ${message}`, details);
};

exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { menuItemId, quantity = 1 } = req.body;

    if (!menuItemId) {
      logCartWarning("menuItemId is missing", { userId, body: req.body });
      return res.status(400).json({ message: "menuItemId is required" });
    }

    const normalizedQuantity = Number(quantity);
    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      logCartWarning("Invalid quantity", { userId, menuItemId, quantity });
      return res.status(400).json({ message: "quantity must be a positive number" });
    }

    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
      logCartWarning("Menu item not found", { userId, menuItemId });
      return res.status(404).json({ message: "Menu item not found" });
    }

    let cart = await Cart.findOne({ userId });

    const totalItemPrice = menuItem.price * normalizedQuantity;

    if (!cart) {
      cart = await Cart.create({
        userId,
        kitchenId: menuItem.partner,
        items: [
          {
            productId: menuItem._id,
            kitchenId: menuItem.partner,
            name: menuItem.name,
            price: menuItem.price,
            quantity: normalizedQuantity,
            totalItemPrice
          }
        ],
        totalAmount: totalItemPrice
      });

      return res.json({ message: "Item added to cart", cart });
    }

    if (cart.kitchenId.toString() !== menuItem.partner.toString()) {
      logCartWarning("Multiple kitchen attempt blocked", {
        userId,
        existingKitchenId: cart.kitchenId?.toString(),
        requestedKitchenId: menuItem.partner?.toString(),
        menuItemId
      });
      return res.status(400).json({
        message: "You can only order from one kitchen at a time"
      });
    }

    const existingItem = cart.items.find(
      item => item.productId.toString() === menuItemId
    );

    if (existingItem) {
      existingItem.quantity += normalizedQuantity;
      existingItem.totalItemPrice += totalItemPrice;
    } else {
      cart.items.push({
        productId: menuItem._id,
        kitchenId: menuItem.partner,
        name: menuItem.name,
        price: menuItem.price,
        quantity: normalizedQuantity,
        totalItemPrice
      });
    }

    cart.totalAmount = cart.items.reduce(
      (sum, item) => sum + item.totalItemPrice,
      0
    );

    await cart.save();

    res.json({ message: "Cart updated successfully", cart });
  } catch (error) {
    console.error("[cart.addToCart] Unexpected error", error);
    res.status(500).json({ message: error.message });
  }
};

exports.checkout = async (req, res) => {
  try {
    const userId = req.user.id;
    const { couponCode } = req.body;

    const cart = await Cart.findOne({ userId });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let discount = 0;

    if (couponCode) {
      const now = new Date();
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isActive: true
      });

      if (!coupon) {
        return res.status(400).json({ message: "Invalid coupon" });
      }

      if (coupon.validFrom && coupon.validFrom > now) {
        return res.status(400).json({ message: "Coupon is not active yet" });
      }

      if (coupon.validTill && coupon.validTill < now) {
        return res.status(400).json({ message: "Coupon expired" });
      }

      if (coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({ message: "Coupon usage limit exceeded" });
      }

      if (cart.totalAmount < (coupon.minOrderAmount || 0)) {
        return res.status(400).json({
          message: `Minimum order amount is ${coupon.minOrderAmount}`
        });
      }

      if (
        Array.isArray(coupon.applicableKitchens) &&
        coupon.applicableKitchens.length > 0 &&
        !coupon.applicableKitchens.some((id) => id.toString() === cart.kitchenId?.toString())
      ) {
        return res.status(400).json({ message: "Coupon is not applicable for this kitchen" });
      }

      if (coupon.discountType === "PERCENTAGE") {
        discount = (cart.totalAmount * coupon.discountValue) / 100;
      } else {
        discount = coupon.discountValue;
      }

      if (coupon.maxDiscountAmount) {
        discount = Math.min(discount, coupon.maxDiscountAmount);
      }
    }

    const deliveryCharge = 30;
    const tax = cart.totalAmount * 0.05;
    const finalAmount = cart.totalAmount + deliveryCharge + tax - discount;

    res.json({
      cartAmount: cart.totalAmount,
      discount,
      tax,
      deliveryCharge,
      finalAmount
    });
  } catch (error) {
    console.error("[cart.checkout] Unexpected error", error);
    res.status(500).json({ message: error.message });
  }
};
