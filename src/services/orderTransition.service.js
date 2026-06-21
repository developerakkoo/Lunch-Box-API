const Order = require("../module/order.model");
const {
  applyTimelineForStatus,
  canTransition,
  buildOrderStatusPayload,
} = require("../constants/orderStatus");
const { publishOrderEvent } = require("../utils/orderEvents");

const ORDER_EVENT_BY_STATUS = {
  ACCEPTED: "ORDER_ACCEPTED",
  PREPARING: "ORDER_PREPARING",
  READY: "ORDER_READY",
  OUT_FOR_DELIVERY: "ORDER_PICKED",
  DELIVERED: "ORDER_DELIVERED",
  CANCELLED: "ORDER_CANCELLED",
};

async function transitionOrder({
  order,
  orderId,
  actorRole,
  actorId,
  toStatus,
  eventType,
  metadata = {},
  beforeSave,
  afterSave,
}) {
  const doc = order || await Order.findById(orderId);
  if (!doc) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    err.code = "ORDER_NOT_FOUND";
    throw err;
  }

  const fromStatus = doc.status;
  if (!canTransition(fromStatus, toStatus, actorRole, doc)) {
    const err = new Error(`Cannot move order from ${fromStatus} to ${toStatus}`);
    err.statusCode = 409;
    err.code = "INVALID_ORDER_TRANSITION";
    throw err;
  }

  doc.status = toStatus;
  applyTimelineForStatus(doc, toStatus);
  doc.statusAudit = doc.statusAudit || [];
  doc.statusAudit.push({
    fromStatus,
    toStatus,
    actorRole,
    actorId,
    reason: metadata.reason,
    at: new Date(),
  });

  if (beforeSave) {
    await beforeSave(doc);
  }

  await doc.save();

  if (afterSave) {
    await afterSave(doc);
  }

  await publishOrderEvent({
    type: eventType || ORDER_EVENT_BY_STATUS[toStatus] || "ORDER_STATUS_UPDATED",
    order: doc,
    updatedBy: actorRole,
    actorId,
    ...metadata,
  });

  return {
    order: doc,
    statusPayload: buildOrderStatusPayload(doc, metadata),
  };
}

module.exports = {
  transitionOrder,
};
