const crypto = require("crypto");
const logger = require("./logger");

const CUSTOMER_STATUS = {
  PLACED: "ORDER_RECEIVED",
  ACCEPTED: "ACCEPTED",
  PREPARING: "PROCESSING",
  READY: "READY_FOR_PICKUP",
  OUT_FOR_DELIVERY: "ON_ROUTE",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED"
};

const activeLocks = new Map();

const cleanupExpiredLock = (key) => {
  const lock = activeLocks.get(key);
  if (lock && lock.expiresAt <= Date.now()) {
    activeLocks.delete(key);
  }
};

const getCustomerStatus = (order) => CUSTOMER_STATUS[order?.status] || order?.status || null;

const emitOrderStatusUpdate = (io, order) => {
  if (!io || !order?.user) return;

  io.to(`user_${order.user}`).emit("order_status_update", {
    orderId: order._id,
    status: getCustomerStatus(order),
    internalStatus: order.status,
    timeline: order.timeline
  });
};

const publishOrderEvent = async (event) => {
  logger.debug("Order event published locally", {
    type: event?.type,
    orderId: event?.order?._id
  });
  return event;
};

const acquireOrderLock = async (orderId, action, ttlSeconds = 15) => {
  if (!orderId || !action) return null;

  const key = `${orderId}:${action}`;
  cleanupExpiredLock(key);

  if (activeLocks.has(key)) {
    return null;
  }

  const value = `${process.pid}:${crypto.randomUUID()}`;
  activeLocks.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000
  });

  return { key, value };
};

const releaseOrderLock = async (lock) => {
  if (!lock?.key || !lock?.value) return null;

  cleanupExpiredLock(lock.key);
  const current = activeLocks.get(lock.key);
  if (current && current.value === lock.value) {
    activeLocks.delete(lock.key);
  }
};

const setDriverPresence = async () => null;
const setPartnerPresence = async () => null;
const setDriverAssignment = async () => null;
const clearDriverAssignment = async () => null;
const removeDriverReadyOrder = async () => null;

const startOrderEventBridge = async () => null;

module.exports = {
  CUSTOMER_STATUS,
  acquireOrderLock,
  clearDriverAssignment,
  emitOrderStatusUpdate,
  publishOrderEvent,
  releaseOrderLock,
  removeDriverReadyOrder,
  setDriverAssignment,
  setDriverPresence,
  setPartnerPresence,
  startOrderEventBridge
};
