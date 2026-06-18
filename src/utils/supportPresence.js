const User = require("../module/user.model");

const broadcastUserPresence = (userId, isOnline, lastSeenAt) => {
  if (!global.io) return;
  global.io.to("admin_support").emit("support_user_presence", {
    userId: String(userId),
    isOnline,
    lastSeenAt
  });
};

const setUserOnline = async (userId) => {
  const now = new Date();
  await User.findByIdAndUpdate(userId, {
    $set: {
      "supportPresence.isOnline": true,
      "supportPresence.lastSeenAt": now
    }
  });
  broadcastUserPresence(userId, true, now);
};

const setUserOffline = async (userId) => {
  const now = new Date();
  await User.findByIdAndUpdate(userId, {
    $set: {
      "supportPresence.isOnline": false,
      "supportPresence.lastSeenAt": now
    }
  });
  broadcastUserPresence(userId, false, now);
};

module.exports = {
  setUserOnline,
  setUserOffline,
  broadcastUserPresence
};
