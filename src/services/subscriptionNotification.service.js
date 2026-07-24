const { notifyUser } = require("../utils/userNotification");
const { notifyPartner } = require("../utils/partnerNotification");
const { notifyDeliveryAgent } = require("../utils/deliveryNotification");

async function notifyUserSubscriptionEvent(userId, { title, message, type, data = {} }) {
  if (!userId) return;

  // Persist to the user's notification inbox (also emits "user_notification").
  await notifyUser({
    userId,
    type: "SUBSCRIPTION",
    title,
    message,
    data: { subscriptionEvent: type, ...data }
  });

  if (global.io) {
    global.io.to(`user_${userId}`).emit("subscription_notification", {
      title,
      message,
      type,
      data,
      at: new Date().toISOString()
    });
  }
}

async function notifyPartnerSubscription(partnerId, payload) {
  // notifyPartner persists the row and emits "partner_notification".
  await notifyPartner({
    partnerId,
    title: payload.title,
    message: payload.message,
    type: "SUBSCRIPTION_ORDER",
    data: { subscriptionEvent: payload.type, ...(payload.data || {}) }
  });
}

async function notifyDriverSubscription(driverId, payload) {
  await notifyDeliveryAgent(driverId, {
    title: payload.title,
    message: payload.message,
    type: payload.type || "SUBSCRIPTION",
    data: payload.data
  });
}

/**
 * Emits a realtime "subscription_delivery_update" so the user's app can
 * refresh the delivery status live. Optionally mirrors to the kitchen room.
 */
function emitSubscriptionDeliveryUpdate(delivery, { userId, partnerId } = {}) {
  if (!global.io || !delivery) return;
  const payload = { delivery };
  if (userId) {
    global.io.to(`user_${userId}`).emit("subscription_delivery_update", payload);
  }
  if (partnerId) {
    global.io.to(`kitchen_${partnerId}`).emit("subscription_delivery_update", payload);
  }
}

module.exports = {
  notifyUserSubscriptionEvent,
  notifyPartnerSubscription,
  notifyDriverSubscription,
  emitSubscriptionDeliveryUpdate
};
