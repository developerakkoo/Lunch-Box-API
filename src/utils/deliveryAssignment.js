const DeliveryAgent = require("../module/Delivery_Agent");
const Order = require("../module/order.model");
const { notifyDeliveryAgent } = require("./deliveryNotification");
const { isSelfDeliveryOrder } = require("./selfDelivery");
const {
  publishOrderEvent,
  removeDriverReadyOrder,
  setDriverAssignment
} = require("./orderEvents");

async function assignDeliveryBoy(order) {
  logger.info("Attempting delivery assignment", { orderId: order?._id, partnerId: order?.partner });
  if (!order || order.status !== "READY") {
    logger.warn("Skipping assignment for non-ready order", { orderId: order?._id, status: order?.status });
    return null;
  }

  if (isSelfDeliveryOrder(order)) {
    logger.info("Skipping assignment for self-delivery order", { orderId: order._id });
    return null;
  }

  const availableBoy = await DeliveryAgent.findOneAndUpdate(
    {
      isOnline: true,
      isAvailable: true,
      currentOrder: null,
      status: "APPROVED",
      deletedAt: null,
    },
    {
      $set: {
        currentOrder: order._id,
        isAvailable: false,
      },
    },
    { new: true, sort: { updatedAt: 1 } }
  );

  if (!availableBoy) {
    logger.warn("No available driver found for assignment", { orderId: order?._id });
    return null;
  }

  const assignedOrder = await Order.findOneAndUpdate(
    { _id: order._id, status: "READY", deliveryAgent: null },
    { $set: { deliveryAgent: availableBoy._id } },
    { new: true }
  );

  if (!assignedOrder) {
    availableBoy.currentOrder = null;
    availableBoy.isAvailable = true;
    await availableBoy.save();
    logger.warn("Order assignment lost race", { orderId: order._id, driverId: availableBoy._id });
    return null;
  }

  order = assignedOrder;
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
