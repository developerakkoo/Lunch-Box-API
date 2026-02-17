const DeliveryAgent = require("../module/Delivery_Agent");
const Order = require("../module/order.model");

async function assignDeliveryBoy(order) {
  console.log("🚴 Searching for delivery boy...");

  const availableBoy = await DeliveryAgent.findOne({
    isActive: true,
    availabilityStatus: "ONLINE"
  });

  if (!availableBoy) {
    console.log("❌ No delivery boy available");
    return;
  }

  order.deliveryBoyId = availableBoy._id;
  order.orderStatus = "PROCESSING";
  await order.save();

  console.log("✅ Delivery Assigned:", availableBoy._id);

  global.io.to(`delivery_${availableBoy._id}`).emit(
    "order_assigned",
    order
  );
}

module.exports = assignDeliveryBoy;
