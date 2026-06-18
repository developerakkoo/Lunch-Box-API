const UserNotification = require("../module/userNotification.model");

const notifyUser = async ({
  userId,
  type = "SYSTEM",
  title,
  message,
  data = {}
}) => {
  if (!userId || !title || !message) return null;

  const notification = await UserNotification.create({
    userId,
    type,
    title,
    message,
    data
  });

  if (global.io) {
    global.io.to(`user_${userId}`).emit("user_notification", notification);
  }

  return notification;
};

module.exports = {
  notifyUser
};
