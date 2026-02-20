const DeliveryNotification = require("../module/deliveryNotification.model");

const notifyDeliveryAgent = async ({
  deliveryAgentId,
  type = "SYSTEM",
  title,
  message,
  data = {}
}) => {
  if (!deliveryAgentId || !title || !message) return null;

  const notification = await DeliveryNotification.create({
    deliveryAgentId,
    type,
    title,
    message,
    data
  });

  if (global.io) {
    global.io.to(`delivery_${deliveryAgentId}`).emit("delivery_notification", notification);
  }

  return notification;
};

module.exports = {
  notifyDeliveryAgent
};
