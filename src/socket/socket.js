const { Server } = require("socket.io");
const logger = require("../utils/logger");

let io;

const getSocketCorsOrigins = () => {
  const raw = process.env.CORS_ORIGINS || process.env.SOCKET_CORS_ORIGINS || "*";
  if (raw === "*") return "*";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: getSocketCorsOrigins(),
      methods: ["GET", "POST"],
    },
  });

  logger.info("Socket.IO initialized");

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

module.exports = { initSocket, getIO };
