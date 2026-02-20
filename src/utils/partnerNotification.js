const PartnerNotification = require("../module/partnerNotification.model");

const notifyPartner = async ({
  partnerId,
  type = "SYSTEM",
  title,
  message,
  data = {}
}) => {
  if (!partnerId || !title || !message) return null;

  const notification = await PartnerNotification.create({
    partnerId,
    type,
    title,
    message,
    data
  });

  if (global.io) {
    global.io.to(`kitchen_${partnerId}`).emit("partner_notification", notification);
  }

  return notification;
};

module.exports = {
  notifyPartner
};
