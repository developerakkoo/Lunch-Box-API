require("dotenv").config();
const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { initSocket } = require("./socket/socket");
const { orderSocketHandler } = require("./socket/order.socket");
const { initDeliveryTrackingSocket } = require("./socket/deliveryTracking.socket");
const { initSubscriptionSchedulers } = require("./jobs/subscriptionScheduler");

const PORT = process.env.PORT || 8000;

const server = http.createServer(app);
const io = initSocket(server);

global.io = io;
initDeliveryTrackingSocket(io);
orderSocketHandler();

connectDB().then(() => {
  initSubscriptionSchedulers();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
