let io;

exports.initDeliveryTrackingSocket = (serverIO) => {
  io = serverIO;

  io.on("connection", (socket) => {

    /*
    |--------------------------------------------------------------------------
    | DELIVERY AGENT SEND LOCATION
    |--------------------------------------------------------------------------
    */
    socket.on("delivery-location-update", (data) => {

      const { deliveryId, orderId, latitude, longitude } = data;

      console.log("📍 Delivery Location Update:", data);

      // Send location to user + partner rooms
      io.to(`order_${orderId}`).emit("delivery-location", {
        deliveryId,
        latitude,
        longitude,
      });
    });

  });
};


exports.getDeliveryTrackingIO = () => io;
