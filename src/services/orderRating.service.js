const mongoose = require("mongoose");
const Order = require("../module/order.model");
const Partner = require("../module/partner.model");
const DeliveryAgent = require("../module/Delivery_Agent");

const REVIEW_MAX_LENGTH = 500;

class RatingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "RatingError";
    this.status = status;
    this.code = code;
  }
}

function emptyDistribution() {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

function distributionSource(raw) {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  if (typeof raw.toObject === "function") return raw.toObject();
  return raw;
}

function presentRatingSummary(summary) {
  const plain = summary && typeof summary.toObject === "function"
    ? summary.toObject()
    : summary;
  const distribution = emptyDistribution();
  const source = distributionSource(plain?.distribution);
  for (const star of [1, 2, 3, 4, 5]) {
    distribution[star] = Number(source[star] ?? source[String(star)] ?? 0);
  }
  return {
    averageRating: Number(Number(plain?.averageRating || 0).toFixed(2)),
    totalReviews: Number(plain?.totalReviews || 0),
    distribution
  };
}

function buildRatingSummary(groups) {
  const distribution = emptyDistribution();
  let total = 0;
  let weighted = 0;
  for (const row of groups || []) {
    const star = Math.round(Number(row._id));
    const count = Number(row.count) || 0;
    if (star >= 1 && star <= 5 && count > 0) {
      distribution[star] += count;
      total += count;
      weighted += star * count;
    }
  }
  return {
    averageRating: total ? Number((weighted / total).toFixed(2)) : 0,
    totalReviews: total,
    distribution
  };
}

function reviewerFirstName(fullName) {
  const name = String(fullName || "").trim();
  if (!name) return "Guest";
  return name.split(/\s+/)[0];
}

function parseStar(value, { required, code, label }) {
  if (value === undefined || value === null || value === "") {
    if (!required) return undefined;
    throw new RatingError(400, code, `${label} must be an integer between 1 and 5`);
  }
  if (typeof value === "boolean" || Array.isArray(value)) {
    throw new RatingError(400, code, `${label} must be an integer between 1 and 5`);
  }
  const numeric = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    throw new RatingError(400, code, `${label} must be an integer between 1 and 5`);
  }
  return numeric;
}

function parseReview(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (text.length > REVIEW_MAX_LENGTH) {
    throw new RatingError(400, "INVALID_REVIEW", `review must be at most ${REVIEW_MAX_LENGTH} characters`);
  }
  return text;
}

function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

function partnerKey(id) {
  if (!id) return "";
  return String(id._id || id);
}

async function liveRatingSummaries(partnerIds) {
  const ids = [...new Set((partnerIds || []).map(partnerKey).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  const result = new Map();
  if (!ids.length) return result;

  const groups = await Order.aggregate([
    {
      $match: {
        partner: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
        status: "DELIVERED",
        "rating.partnerRating": { $gte: 1, $lte: 5 }
      }
    },
    {
      $group: {
        _id: { partner: "$partner", star: "$rating.partnerRating" },
        count: { $sum: 1 }
      }
    }
  ]);

  const rowsByPartner = new Map(ids.map((id) => [id, []]));
  for (const row of groups) {
    const id = String(row._id?.partner || "");
    if (!rowsByPartner.has(id)) rowsByPartner.set(id, []);
    rowsByPartner.get(id).push({ _id: row._id?.star, count: row.count });
  }
  for (const [id, rows] of rowsByPartner) {
    result.set(id, buildRatingSummary(rows));
  }
  return result;
}

async function recomputePartnerRating(partnerId) {
  const id = partnerKey(partnerId);
  if (!id) return presentRatingSummary(null);
  const live = await liveRatingSummaries([id]);
  const summary = live.get(id) || presentRatingSummary(null);
  try {
    await Partner.updateOne({ _id: id }, { $set: { ratingSummary: summary } });
  } catch (_) {
    // The order rating is already saved. A summary write must not hide it.
  }
  return summary;
}

async function recomputeDeliveryAgentRating(agentId) {
  if (!agentId) return null;
  const groups = await Order.aggregate([
    {
      $match: {
        deliveryAgent: toObjectId(agentId),
        "rating.deliveryRating": { $gte: 1, $lte: 5 }
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating.deliveryRating" },
        totalRatings: { $sum: 1 }
      }
    }
  ]);
  const stats = groups[0];
  const rating = {
    averageRating: Number(Number(stats?.averageRating || 0).toFixed(2)),
    totalRatings: Number(stats?.totalRatings || 0)
  };
  await DeliveryAgent.updateOne({ _id: agentId }, { $set: { rating } });
  return rating;
}

async function submitOrderRating({ order, partnerRating, deliveryRating, review }) {
  if (!order) {
    throw new RatingError(404, "ORDER_NOT_FOUND", "Order not found");
  }
  if (order.status !== "DELIVERED") {
    throw new RatingError(409, "INVALID_ORDER_STATE", "Only delivered orders can be rated");
  }

  const stars = parseStar(partnerRating, {
    required: true,
    code: "INVALID_PARTNER_RATING",
    label: "partnerRating"
  });
  const comment = parseReview(review);
  const hasDriver = Boolean(order.deliveryAgent);
  const driverStars = hasDriver
    ? parseStar(deliveryRating, {
        required: false,
        code: "INVALID_DELIVERY_RATING",
        label: "deliveryRating"
      })
    : undefined;

  if (!order.rating) order.rating = {};
  const now = new Date();
  order.rating.partnerRating = stars;
  if (comment !== undefined) {
    order.rating.review = comment;
  }
  if (hasDriver && driverStars !== undefined) {
    order.rating.deliveryRating = driverStars;
  }
  if (!order.rating.ratedAt) {
    order.rating.ratedAt = now;
  }
  order.rating.updatedAt = now;
  order.markModified("rating");
  await order.save();

  let ratingSummary = presentRatingSummary(null);
  try {
    ratingSummary = await recomputePartnerRating(order.partner);
  } catch (_) {
    ratingSummary = presentRatingSummary(null);
  }
  if (hasDriver) {
    try {
      await recomputeDeliveryAgentRating(order.deliveryAgent);
    } catch (_) {
      // Delivery average is derived. A failed recompute still leaves the order rating saved.
    }
  }

  return {
    rating: order.rating,
    partnerId: partnerKey(order.partner),
    ratingSummary
  };
}

async function listKitchenReviews({ kitchenId, page = 1, limit = 10 }) {
  if (!mongoose.Types.ObjectId.isValid(kitchenId)) {
    throw new RatingError(400, "INVALID_KITCHEN_ID", "kitchenId must be a valid id");
  }

  const partner = await Partner.findById(kitchenId).select("ratingSummary").lean();
  if (!partner) {
    throw new RatingError(404, "KITCHEN_NOT_FOUND", "Kitchen not found");
  }

  const pageNumber = Math.max(Number(page) || 1, 1);
  const limitNumber = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const filter = {
    partner: kitchenId,
    status: "DELIVERED",
    "rating.partnerRating": { $gte: 1, $lte: 5 }
  };

  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter)
      .sort({ "rating.ratedAt": -1, updatedAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .select("rating items user updatedAt")
      .populate("user", "fullName")
      .lean()
  ]);

  const reviews = orders.map((order) => {
    const items = (order.items || [])
      .map((item) => (item?.name ? String(item.name) : ""))
      .filter(Boolean)
      .slice(0, 2);
    return {
      id: order._id,
      rating: Number(order.rating?.partnerRating || 0),
      review: order.rating?.review || "",
      ratedAt: order.rating?.ratedAt || order.updatedAt || null,
      reviewerName: reviewerFirstName(order.user?.fullName),
      items
    };
  });

  const stored = presentRatingSummary(partner.ratingSummary);
  let ratingSummary = stored;
  try {
    const live = await liveRatingSummaries([kitchenId]);
    const next = live.get(String(kitchenId));
    if (next) {
      ratingSummary = next;
      if (next.totalReviews !== stored.totalReviews || next.averageRating !== stored.averageRating) {
        try {
          await Partner.updateOne({ _id: kitchenId }, { $set: { ratingSummary: next } });
        } catch (_) {
          // Return the live summary even when the stored copy cannot be updated.
        }
      }
    }
  } catch (_) {
    ratingSummary = stored;
  }
  return {
    ratingSummary,
    averageRating: ratingSummary.averageRating,
    totalReviews: ratingSummary.totalReviews,
    reviews,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total
    }
  };
}

async function backfillPartnerRatings() {
  const ratedFilter = {
    status: "DELIVERED",
    "rating.partnerRating": { $gte: 1, $lte: 5 },
    $or: [{ "rating.ratedAt": null }, { "rating.ratedAt": { $exists: false } }]
  };
  await Order.updateMany(ratedFilter, [
    {
      $set: {
        "rating.ratedAt": "$updatedAt",
        "rating.updatedAt": "$updatedAt"
      }
    }
  ]);

  const partnerIds = await Order.distinct("partner", {
    status: "DELIVERED",
    "rating.partnerRating": { $gte: 1, $lte: 5 }
  });
  for (const partnerId of partnerIds) {
    await recomputePartnerRating(partnerId);
  }

  const agentIds = await Order.distinct("deliveryAgent", {
    deliveryAgent: { $ne: null },
    "rating.deliveryRating": { $gte: 1, $lte: 5 }
  });
  for (const agentId of agentIds) {
    if (!agentId) continue;
    await recomputeDeliveryAgentRating(agentId);
  }

  return {
    partners: partnerIds.length,
    agents: agentIds.filter(Boolean).length
  };
}

module.exports = {
  REVIEW_MAX_LENGTH,
  RatingError,
  presentRatingSummary,
  buildRatingSummary,
  reviewerFirstName,
  parseStar,
  parseReview,
  liveRatingSummaries,
  recomputePartnerRating,
  recomputeDeliveryAgentRating,
  submitOrderRating,
  listKitchenReviews,
  backfillPartnerRatings
};
