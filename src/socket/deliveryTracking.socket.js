const jwt = require("jsonwebtoken");
const Order = require("../module/order.model");

let io;

exports.initDeliveryTrackingSocket = (serverIO) => {
  io = serverIO;

  io.on("connection", (socket) => {
    socket.on("delivery-location-update", async (data, callback) => {
      try {
        const token = socket.handshake.auth?.token;
        const role = socket.handshake.auth?.role;
        if (!token || role !== "DELIVERY_AGENT") {
          return callback && callback({ status: "error", message: "Unauthorized delivery tracking" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { orderId, latitude, longitude } = data || {};

        const order = await Order.findOne({
          _id: orderId,
          deliveryAgent: decoded.id,
          status: "OUT_FOR_DELIVERY"
        }).select("_id user partner");

        if (!order) {
          return callback && callback({ status: "error", message: "Tracking not allowed for this order" });
        }

        const payload = {
          orderId,
          deliveryId: decoded.id,
          latitude,
          longitude
        };

        io.to(`order_${orderId}`).emit("delivery-location", payload);
        io.to(`user_${order.user}`).emit("delivery-location", payload);
        io.to(`kitchen_${order.partner}`).emit("delivery-location", payload);

        callback && callback({ status: "ok" });
      } catch (error) {
        callback && callback({ status: "error", message: "Delivery tracking failed" });
      }
    });
  });
};

exports.getDeliveryTrackingIO = () => io;
