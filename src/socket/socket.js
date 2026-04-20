const { Server } = require("socket.io");
const logger = require("../utils/logger");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*"
    }
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
