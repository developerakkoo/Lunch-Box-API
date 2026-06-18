const AdminNotification = require("../module/adminNotification.model");

const notifyAdmin = async ({
  adminId = null,
  type = "SYSTEM",
  title,
  message,
  data = {}
}) => {
  if (!title || !message) return null;

  const notification = await AdminNotification.create({
    adminId,
    type,
    title,
    message,
    data
  });

  if (global.io) {
    global.io.to("admin_support").emit("admin_notification", notification);
  }

  return notification;
};

module.exports = {
  notifyAdmin
};
