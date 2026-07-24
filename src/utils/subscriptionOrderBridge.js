const mongoose = require("mongoose");
const Order = require("../module/order.model");
const User = require("../module/user.model");
const MenuItem = require("../module/menuItem.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const UserSubscription = require("../module/userSubscription.model");
const Partner = require("../module/partner.model");
const assignDeliveryBoy = require("./deliveryAssignment");
const { isSelfDeliveryOrder } = require("./selfDelivery");
const { publishOrderEvent } = require("./orderEvents");
const { notifyUser } = require("./userNotification");
const logger = require("./logger");

/**
 * Emits the updated delivery to the subscriber and the kitchen so both apps
 * refresh live, and drops an inbox notification for the user.
 */
async function broadcastDeliveryStatusFromOrder(deliveryId, { title, message }) {
  const delivery = await SubscriptionDelivery.findById(deliveryId)
    .populate("userSubscriptionId")
    .catch(() => null);
  if (!delivery) return;

  const sub = delivery.userSubscriptionId;
  const userId = sub?.userId;
  const partnerId = sub?.partnerId;

  if (global.io) {
    if (userId) {
      global.io.to(`user_${userId}`).emit("subscription_delivery_update", { delivery });
    }
    if (partnerId) {
      global.io.to(`kitchen_${partnerId}`).emit("subscription_delivery_update", { delivery });
    }
  }

  if (userId && title) {
    await notifyUser({
      userId,
      type: "SUBSCRIPTION",
      title,
      message,
      data: {
        type: "SUBSCRIPTION",
        deliveryId: String(delivery._id),
        subscriptionId: String(sub?._id || ""),
        status: delivery.status,
      },
    }).catch(() => {});
  }
}

function pickAddress(user) {
  if (!user?.addresses?.length) return null;
  const def = user.addresses.find((a) => a.isDefault);
  return def ?? user.addresses[0];
}

async function resolveSubscriptionDoc(delivery) {
  const raw = delivery.userSubscriptionId;
  if (raw && typeof raw === "object" && raw.partnerId) {
    return raw;
  }
  return UserSubscription.findById(raw).exec();
}

/**
 * Creates a READY Order from a SubscriptionDelivery when kitchen marks fulfilment READY.
 * Idempotent when linkedOrderId already points at an existing Order.
 *
 * Duplicate READY / concurrent calls: only one succeeds at linking an order; orphans are deleted.
 */
async function materializeOrderFromSubscriptionDelivery(deliveryId) {
  if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
    logger.warn("materializeSubscriptionOrder: invalid delivery id", { deliveryId });
    return null;
  }

  const deliveryDoc = await SubscriptionDelivery.findById(deliveryId).populate("userSubscriptionId");
  if (!deliveryDoc) return null;

  if (deliveryDoc.linkedOrderId) {
    const existing = await Order.findById(deliveryDoc.linkedOrderId);
    if (existing) return existing;
  }

  const sub = await resolveSubscriptionDoc(deliveryDoc);
  if (!sub) {
    logger.error("materializeSubscriptionOrder: missing UserSubscription", { deliveryId });
    return null;
  }

  const userId = sub.userId;
  const partnerId = sub.partnerId;
  const menuItemId = sub.menuItemId;

  const user = await User.findById(userId).select("addresses");
  const address =
    sub.deliveryAddress?.fullAddress
      ? sub.deliveryAddress
      : pickAddress(user);
  if (!address?.fullAddress) {
    logger.error("materializeSubscriptionOrder: user has no saved address", { userId });
    return null;
  }

  const menuDoc = menuItemId ? await MenuItem.findById(menuItemId).select("name price") : null;
  const mealName = menuDoc?.name ?? sub.title ?? "Subscription meal";

  const unitPrice =
    typeof sub.pricePerMeal === "number" && !Number.isNaN(sub.pricePerMeal)
      ? sub.pricePerMeal
      : typeof menuDoc?.price === "number"
        ? menuDoc.price
        : 0;

  const now = new Date();

  const partnerDoc = await Partner.findById(partnerId).select("selfDelivery").lean();

  const order = await Order.create({
    user: userId,
    partner: partnerId,
    selfDelivery: partnerDoc?.selfDelivery === true,
    deliveryAgent: null,
    orderType: "SUBSCRIPTION",
    subscriptionDeliveryId: deliveryDoc._id,
    items: [
      {
        menuItem: menuItemId || undefined,
        name: mealName,
        price: unitPrice,
        quantity: 1,
        addons: [],
      },
    ],
    priceDetails: {
      itemTotal: unitPrice,
      tax: 0,
      deliveryCharge: 0,
      platformFee: sub.platformFeeAmount ? sub.platformFeeAmount / (sub.durationInDays || 1) : 0,
      discount: 0,
      totalAmount: unitPrice,
    },
    deliveryAddress: {
      fullAddress: address.fullAddress,
      latitude: address.latitude ?? undefined,
      longitude: address.longitude ?? undefined,
    },
    payment: {
      method: "COD",
      paymentStatus: "PAID",
    },
    status: "READY",
    timeline: {
      placedAt: now,
      acceptedAt: now,
      preparingAt: now,
      readyAt: now,
    },
  });

  const linkResult = await SubscriptionDelivery.updateOne(
    { _id: deliveryDoc._id, linkedOrderId: null },
    { $set: { linkedOrderId: order._id } }
  );

  if (!linkResult.modifiedCount) {
    await Order.findByIdAndDelete(order._id);
    const refreshedDelivery = await SubscriptionDelivery.findById(deliveryDoc._id).lean();
    return refreshedDelivery?.linkedOrderId
      ? Order.findById(refreshedDelivery.linkedOrderId).exec()
      : null;
  }

  logger.info("Subscription-linked Order created (READY)", {
    orderId: order._id,
    subscriptionDeliveryId: deliveryDoc._id,
    userId,
  });

  try {
    if (!isSelfDeliveryOrder(order)) {
      await assignDeliveryBoy(order);
    }
  } catch (e) {
    logger.warn("assignDeliveryBoy failed for subscription order", {
      orderId: order._id,
      message: e?.message,
    });
  }

  const refreshed = await Order.findById(order._id).exec();

  await SubscriptionDelivery.updateOne(
    { _id: deliveryDoc._id },
    { $set: { deliveryBoyId: refreshed?.deliveryAgent || null } }
  ).catch(() => {});

  global.io?.to(`user_${refreshed.user}`).emit("order_ready", refreshed);

  await publishOrderEvent({
    type: "ORDER_READY",
    order: refreshed,
    subscriptionDeliveryId: deliveryDoc._id,
  });

  return refreshed;
}

/**
 * When driver completes subscription-backed order, mirror status on SubscriptionDelivery.
 */
async function markSubscriptionDeliveryDeliveredFromOrder(order) {
  if (!order?.subscriptionDeliveryId) return;

  await SubscriptionDelivery.findByIdAndUpdate(order.subscriptionDeliveryId, {
    $set: {
      status: "DELIVERED",
      "timeline.deliveredAt": new Date(),
      ...(order.deliveryAgent ? { deliveryBoyId: order.deliveryAgent } : {}),
    },
  }).catch(() => {});

  logger.info("SubscriptionDelivery mirrored DELIVERED", {
    subscriptionDeliveryId: order.subscriptionDeliveryId,
    orderId: order._id,
  });

  await broadcastDeliveryStatusFromOrder(order.subscriptionDeliveryId, {
    title: "Meal delivered",
    message: "Your subscription meal has been delivered. Enjoy!",
  });
}

/**
 * DRIVER picked up subscription order → align subscription delivery lifecycle.
 */
async function markSubscriptionDeliveryOutForDeliveryFromOrder(order) {
  if (!order?.subscriptionDeliveryId) return;

  await SubscriptionDelivery.findByIdAndUpdate(order.subscriptionDeliveryId, {
    $set: {
      status: "OUT_FOR_DELIVERY",
      "timeline.pickedAt": new Date(),
      ...(order.deliveryAgent ? { deliveryBoyId: order.deliveryAgent } : {}),
    },
  }).catch(() => {});

  await broadcastDeliveryStatusFromOrder(order.subscriptionDeliveryId, {
    title: "Meal on the way",
    message: "Your subscription meal is out for delivery.",
  });
}

module.exports = {
  materializeOrderFromSubscriptionDelivery,
  markSubscriptionDeliveryDeliveredFromOrder,
  markSubscriptionDeliveryOutForDeliveryFromOrder,
};
