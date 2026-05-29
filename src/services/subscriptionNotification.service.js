const { notifyPartner } = require("../utils/partnerNotification");
const { notifyDeliveryAgent } = require("../utils/deliveryNotification");

async function notifyUserSubscriptionEvent(userId, { title, message, type }) {
  if (global.io) {
    global.io.to(`user_${userId}`).emit("subscription_notification", {
      title,
      message,
      type,
      at: new Date().toISOString()
    });
  }
}

async function notifyPartnerSubscription(partnerId, payload) {
  await notifyPartner(partnerId, {
    title: payload.title,
    message: payload.message,
    type: payload.type || "SUBSCRIPTION",
    data: payload.data
  });
  if (global.io) {
    global.io.to(`kitchen_${partnerId}`).emit("partner_notification", payload);
  }
}

async function notifyDriverSubscription(driverId, payload) {
  await notifyDeliveryAgent(driverId, {
    title: payload.title,
    message: payload.message,
    type: payload.type || "SUBSCRIPTION",
    data: payload.data
  });
}

module.exports = {
  notifyUserSubscriptionEvent,
  notifyPartnerSubscription,
  notifyDriverSubscription
};
