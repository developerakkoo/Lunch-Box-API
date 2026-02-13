const Order = require("../module/order.model");
const MenuItem = require("../module/menuItem.model");
const AddonItem = require("../module/addonItem.model");
const DeliveryAgent = require("../module/Delivery_Agent");

const {
  emitNewOrderToPartner,
  emitOrderAcceptedToUser,
  emitOrderRejectedToUser,
  emitOrderReadyToDelivery,
  emitDeliveryAssigned,
  emitOrderPicked,
  emitOrderDelivered,
} = require("../socket/order.socket");



/*
|--------------------------------------------------------------------------
| USER CREATE ORDER
|--------------------------------------------------------------------------
*/
exports.createOrder = async (req, res) => {
  try {
    const { partner, items, deliveryAddress, paymentMethod } = req.body;

    let orderItems = [];
    let itemTotal = 0;

    for (let item of items) {

      const menu = await MenuItem.findById(item.menuItem);

      if (!menu) {
        return res.status(404).json({ message: "Menu item not found" });
      }

      let addonList = [];
      let addonTotal = 0;

      if (item.addons?.length) {
        for (let addon of item.addons) {

          const addonData = await AddonItem.findById(addon.addonItem);
          if (!addonData) continue;

          addonList.push({
            addonItem: addonData._id,
            name: addonData.name,
            price: addonData.price,
          });

          addonTotal += addonData.price;
        }
      }

      const itemPrice = (menu.price + addonTotal) * item.quantity;
      itemTotal += itemPrice;

      orderItems.push({
        menuItem: menu._id,
        name: menu.name,
        price: menu.price,
        quantity: item.quantity,
        addons: addonList,
      });
    }

    const tax = itemTotal * 0.05;
    const deliveryCharge = 30;
    const platformFee = 10;
    const totalAmount = itemTotal + tax + deliveryCharge + platformFee;

    const order = await Order.create({
      user: req.user.id,
      partner,
      items: orderItems,
      priceDetails: {
        itemTotal,
        tax,
        deliveryCharge,
        platformFee,
        discount: 0,
        totalAmount,
      },
      deliveryAddress,
      payment: {
        method: paymentMethod,
        paymentStatus: "PENDING",
      },
      timeline: {
        placedAt: new Date(),
      },
    });

    emitNewOrderToPartner(partner, order);

    res.status(201).json(order);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



/*
|--------------------------------------------------------------------------
| PARTNER ACCEPT ORDER
|--------------------------------------------------------------------------
*/
exports.acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        status: "ACCEPTED",
        "timeline.acceptedAt": new Date(),
      },
      { new: true }
    );

    emitOrderAcceptedToUser(order.user, order);

    res.json(order);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



/*
|--------------------------------------------------------------------------
| PARTNER REJECT ORDER
|--------------------------------------------------------------------------
*/
exports.rejectOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        status: "CANCELLED",
        "timeline.cancelledAt": new Date(),
        cancellation: {
          cancelledBy: "PARTNER",
          reason,
        },
      },
      { new: true }
    );

    emitOrderRejectedToUser(order.user, order);

    res.json(order);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



/*
|--------------------------------------------------------------------------
| PARTNER MARK READY
|--------------------------------------------------------------------------
*/
exports.readyOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        status: "READY",
        "timeline.readyAt": new Date(),
      },
      { new: true }
    );

    emitOrderReadyToDelivery(order);

    res.json(order);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



/*
|--------------------------------------------------------------------------
| DELIVERY ASSIGN ORDER
|--------------------------------------------------------------------------
*/
exports.assignDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryId } = req.body;

    const order = await Order.findByIdAndUpdate(
      orderId,
      { deliveryAgent: deliveryId },
      { new: true }
    );

    emitDeliveryAssigned(deliveryId, order);

    res.json(order);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



/*
|--------------------------------------------------------------------------
| DELIVERY PICK ORDER
|--------------------------------------------------------------------------
*/
exports.pickOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { latitude, longitude } = req.body;

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        status: "OUT_FOR_DELIVERY",
        "timeline.pickedAt": new Date(),
      },
      { new: true }
    );

    if (order.deliveryAgent && latitude && longitude) {
      await DeliveryAgent.findByIdAndUpdate(order.deliveryAgent, {
        liveLocation: {
          latitude,
          longitude,
          updatedAt: new Date(),
        }
      });
    }

    emitOrderPicked(order);

    res.json(order);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



/*
|--------------------------------------------------------------------------
| DELIVERY COMPLETE ORDER
|--------------------------------------------------------------------------
*/
exports.completeOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        status: "DELIVERED",
        "timeline.deliveredAt": new Date(),
        "payment.paymentStatus": "PAID",
      },
      { new: true }
    );

    emitOrderDelivered(order);

    res.json(order);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
