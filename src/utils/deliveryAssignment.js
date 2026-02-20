const DeliveryAgent = require("../module/Delivery_Agent");
const { notifyDeliveryAgent } = require("./deliveryNotification");

async function assignDeliveryBoy(order) {
  const availableBoy = await DeliveryAgent.findOne({
    isOnline: true,
    isAvailable: true,
    status: { $in: ["APPROVED", "PENDING"] }
  });

  if (!availableBoy) {
    return null;
  }

  order.deliveryAgent = availableBoy._id;
  await order.save();

  availableBoy.currentOrder = order._id;
  availableBoy.isAvailable = false;
  await availableBoy.save();

  global.io?.to(`delivery_${availableBoy._id}`).emit("order_assigned", order);

  await notifyDeliveryAgent({
    deliveryAgentId: availableBoy._id,
    type: "ORDER_ASSIGNED",
    title: "New Order Assigned",
    message: `Order #${order._id.toString().slice(-6)} assigned to you`,
    data: { orderId: order._id, status: order.status }
  });

  return availableBoy;
}

module.exports = assignDeliveryBoy;
