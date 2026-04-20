const DeliveryAgent = require("../module/Delivery_Agent");
const { notifyDeliveryAgent } = require("./deliveryNotification");
const logger = require("./logger");
const {
  publishOrderEvent,
  removeDriverReadyOrder,
  setDriverAssignment
} = require("./orderEvents");

async function assignDeliveryBoy(order) {
  logger.info("Attempting delivery assignment", { orderId: order?._id, partnerId: order?.partner });
  const availableBoy = await DeliveryAgent.findOne({
    isOnline: true,
    isAvailable: true,
    status: { $in: ["APPROVED", "PENDING"] }
  });

  if (!availableBoy) {
    logger.warn("No available driver found for assignment", { orderId: order?._id });
    return null;
  }

  order.deliveryAgent = availableBoy._id;
  await order.save();

  availableBoy.currentOrder = order._id;
  availableBoy.isAvailable = false;
  await availableBoy.save();
  await setDriverAssignment(availableBoy._id, order._id);
  await removeDriverReadyOrder(order._id);
  logger.info("Driver assigned", { orderId: order._id, driverId: availableBoy._id });

  global.io?.to(`delivery_${availableBoy._id}`).emit("order_assigned", order);
  global.io?.to(`user_${order.user}`).emit("delivery_assigned", {
    orderId: order._id,
    deliveryAgentId: availableBoy._id
  });
  global.io?.to(`kitchen_${order.partner}`).emit("delivery_assigned", {
    orderId: order._id,
    deliveryAgentId: availableBoy._id
  });

  await notifyDeliveryAgent({
    deliveryAgentId: availableBoy._id,
    type: "ORDER_ASSIGNED",
    title: "New Order Assigned",
    message: `Order #${order._id.toString().slice(-6)} assigned to you`,
    data: { orderId: order._id, status: order.status }
  });

  await publishOrderEvent({
    type: "ORDER_ASSIGNED_TO_DRIVER",
    order,
    driverId: availableBoy._id
  });
  logger.debug("Published driver assignment event", { orderId: order._id, driverId: availableBoy._id });

  return availableBoy;
}

module.exports = assignDeliveryBoy;
