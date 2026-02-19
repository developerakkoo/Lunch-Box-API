require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const http = require("http");
const { initSocket } = require("./socket/socket");
const { orderSocketHandler } = require("./socket/order.socket");
const { initDeliveryTrackingSocket } = require("./socket/deliveryTracking.socket");
const PORT = process.env.PORT || 8000;

const server = http.createServer(app);
const io = initSocket(server);
initDeliveryTrackingSocket(io);
orderSocketHandler();



// DB Connect
connectDB();

// Start Server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
