const crypto = require("crypto");
const logger = require("./logger");
const {
  buildOrderStatusPayload,
  getStatusMeta,
} = require("../constants/orderStatus");

/** @deprecated use buildOrderStatusPayload */
const CUSTOMER_STATUS = {
  PLACED: "ORDER_RECEIVED",
  ACCEPTED: "ACCEPTED",
  PREPARING: "PROCESSING",
  READY: "READY_FOR_PICKUP",
  OUT_FOR_DELIVERY: "ON_ROUTE",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

const activeLocks = new Map();

const cleanupExpiredLock = (key) => {
  const lock = activeLocks.get(key);
  if (lock && lock.expiresAt <= Date.now()) {
    activeLocks.delete(key);
  }
};

const getCustomerStatus = (order) =>
  getStatusMeta(order?.status).displayStatus || order?.status || null;

const getIO = () => global.io || null;

const emitOrderUpdate = (io, order, eventType = "ORDER_STATUS_UPDATED", extra = {}) => {
  if (!io || !order) return;

  const payload = {
    type: eventType,
    order: order.toObject ? order.toObject() : order,
    ...buildOrderStatusPayload(order, extra),
  };

  const userId = order.user?._id || order.user;
  const partnerId = order.partner?._id || order.partner;
  const driverId = order.deliveryAgent?._id || order.deliveryAgent;

  if (userId) {
    io.to(`user_${userId}`).emit("order_update", payload);
    io.to(`user_${userId}`).emit("order_status_update", {
      orderId: order._id,
      status: payload.displayStatus,
      internalStatus: order.status,
      timeline: order.timeline,
      title: payload.title,
      subtitle: payload.subtitle,
    });
  }

  if (partnerId) {
    io.to(`kitchen_${partnerId}`).emit("order_update", payload);
  }

  if (driverId) {
    io.to(`delivery_${driverId}`).emit("order_update", payload);
  }

  io.to(`order_${order._id}`).emit("order_update", payload);
  io.to("admin_orders").emit("order_update", payload);
};

const emitOrderStatusUpdate = (io, order) => {
  emitOrderUpdate(io, order, "ORDER_STATUS_UPDATED");
};

const publishOrderEvent = async (event) => {
  const io = getIO();
  const { type, order, updatedBy, driverId } = event || {};

  logger.info("Order event published", {
    type,
    orderId: order?._id,
    updatedBy,
  });

  if (io && order) {
    emitOrderUpdate(io, order, type || "ORDER_STATUS_UPDATED", {
      updatedBy: updatedBy || null,
      driverId: driverId || order.deliveryAgent || null,
    });
  }

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
    expiresAt: Date.now() + ttlSeconds * 1000,
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
const setDriverAssignment = async () => null;
const clearDriverAssignment = async () => null;
const removeDriverReadyOrder = async () => null;
const setPartnerPresence = async () => null;
const startOrderEventBridge = async () => null;

module.exports = {
  CUSTOMER_STATUS,
  acquireOrderLock,
  buildOrderStatusPayload,
  clearDriverAssignment,
  emitOrderStatusUpdate,
  emitOrderUpdate,
  publishOrderEvent,
  releaseOrderLock,
  removeDriverReadyOrder,
  setDriverAssignment,
  setDriverPresence,
  setPartnerPresence,
  startOrderEventBridge,
  getCustomerStatus,
};
