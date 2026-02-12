require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const { Server } = require("socket.io");
const http = require("http");
const { initSocket } = require("./socket/order.socket");
const PORT = process.env.PORT || 8000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

initSocket(io);

// DB Connect
connectDB();

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
