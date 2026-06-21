const ORDER_STATUSES = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

const STATUS_META = {
  PLACED: {
    displayStatus: "ORDER_RECEIVED",
    title: "Order placed",
    subtitle: "Waiting for restaurant to confirm",
    partnerLabel: "New",
    adminLabel: "Placed",
    progressIndex: 0,
  },
  ACCEPTED: {
    displayStatus: "ACCEPTED",
    title: "Confirmed",
    subtitle: "Restaurant accepted your order",
    partnerLabel: "Accepted",
    adminLabel: "Accepted",
    progressIndex: 1,
  },
  PREPARING: {
    displayStatus: "PROCESSING",
    title: "Preparing",
    subtitle: "Your food is being prepared",
    partnerLabel: "Preparing",
    adminLabel: "Preparing",
    progressIndex: 2,
  },
  READY: {
    displayStatus: "READY_FOR_PICKUP",
    title: "Ready",
    subtitle: "Waiting for delivery partner",
    partnerLabel: "Ready for pickup",
    adminLabel: "Ready",
    progressIndex: 3,
  },
  OUT_FOR_DELIVERY: {
    displayStatus: "ON_ROUTE",
    title: "On the way",
    subtitle: "Delivery partner is heading to you",
    partnerLabel: "Out for delivery",
    adminLabel: "On route",
    progressIndex: 4,
  },
  DELIVERED: {
    displayStatus: "DELIVERED",
    title: "Delivered",
    subtitle: "Order completed",
    partnerLabel: "Delivered",
    adminLabel: "Delivered",
    progressIndex: 5,
  },
  CANCELLED: {
    displayStatus: "CANCELLED",
    title: "Cancelled",
    subtitle: "Order was cancelled",
    partnerLabel: "Cancelled",
    adminLabel: "Cancelled",
    progressIndex: -1,
  },
};

const SELF_DELIVERY_SUBTITLE_OVERRIDES = {
  READY: "Delivery handled by the restaurant",
  OUT_FOR_DELIVERY: "Restaurant is on the way",
};

const PROGRESS_TOTAL = 6;

const PARTNER_TRANSITIONS = {
  PLACED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["CANCELLED"],
};

const PARTNER_SELF_DELIVERY_TRANSITIONS = {
  READY: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
};

const USER_CANCEL_ALLOWED = ["PLACED", "ACCEPTED", "PREPARING", "READY"];

const DRIVER_TRANSITIONS = {
  READY: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
};

const ADMIN_TRANSITIONS = {
  PLACED: ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  PREPARING: ["READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["DELIVERED"],
  CANCELLED: ["CANCELLED"],
};

const CLOSED_STATUSES = ["DELIVERED", "CANCELLED"];

function getStatusMeta(status, options = {}) {
  const base = STATUS_META[status] || {
    displayStatus: status,
    title: status,
    subtitle: "",
    partnerLabel: status,
    adminLabel: status,
    progressIndex: 0,
  };

  if (!options.selfDelivery) {
    return base;
  }

  const subtitleOverride = SELF_DELIVERY_SUBTITLE_OVERRIDES[status];
  if (!subtitleOverride) {
    return base;
  }

  return {
    ...base,
    subtitle: subtitleOverride,
  };
}

function buildOrderStatusPayload(order, extra = {}) {
  const status = order?.status || "PLACED";
  const selfDelivery = order?.selfDelivery === true;
  const meta = getStatusMeta(status, { selfDelivery });
  return {
    orderId: order?._id,
    internalStatus: status,
    displayStatus: meta.displayStatus,
    title: meta.title,
    subtitle: meta.subtitle,
    partnerLabel: meta.partnerLabel,
    adminLabel: meta.adminLabel,
    progressIndex: meta.progressIndex,
    progressTotal: PROGRESS_TOTAL,
    timeline: order?.timeline || {},
    deliveryAgentId: order?.deliveryAgent || null,
    partnerId: order?.partner || null,
    userId: order?.user || null,
    orderType: order?.orderType || "INSTANT",
    selfDelivery,
    deliveryHandledBy: selfDelivery ? "RESTAURANT" : "PLATFORM",
    ...extra,
  };
}

function getPartnerTransitions(order) {
  if (order?.selfDelivery === true) {
    return {
      ...PARTNER_TRANSITIONS,
      ...PARTNER_SELF_DELIVERY_TRANSITIONS,
    };
  }
  return PARTNER_TRANSITIONS;
}

function canTransition(fromStatus, toStatus, actorRole, order = null) {
  if (!ORDER_STATUSES.includes(toStatus)) return false;
  if (fromStatus === toStatus) return true;
  if (CLOSED_STATUSES.includes(fromStatus)) return false;

  if (actorRole === "PARTNER") {
    return (getPartnerTransitions(order)[fromStatus] || []).includes(toStatus);
  }
  if (actorRole === "USER") {
    return toStatus === "CANCELLED" && USER_CANCEL_ALLOWED.includes(fromStatus);
  }
  if (actorRole === "DELIVERY_AGENT") {
    if (order?.selfDelivery === true) return false;
    return (DRIVER_TRANSITIONS[fromStatus] || []).includes(toStatus);
  }
  if (actorRole === "ADMIN") {
    return (ADMIN_TRANSITIONS[fromStatus] || []).includes(toStatus);
  }
  return false;
}

function applyTimelineForStatus(order, status) {
  const now = new Date();
  order.timeline = order.timeline || {};
  if (status === "PLACED") order.timeline.placedAt = order.timeline.placedAt || now;
  if (status === "ACCEPTED") order.timeline.acceptedAt = now;
  if (status === "PREPARING") order.timeline.preparingAt = now;
  if (status === "READY") order.timeline.readyAt = now;
  if (status === "OUT_FOR_DELIVERY") order.timeline.pickedAt = now;
  if (status === "DELIVERED") order.timeline.deliveredAt = now;
  if (status === "CANCELLED") order.timeline.cancelledAt = now;
}

module.exports = {
  ORDER_STATUSES,
  STATUS_META,
  PROGRESS_TOTAL,
  CLOSED_STATUSES,
  CLOSED_ORDER_STATUSES: CLOSED_STATUSES,
  USER_CANCEL_ALLOWED,
  getStatusMeta,
  buildOrderStatusPayload,
  canTransition,
  applyTimelineForStatus,
};
