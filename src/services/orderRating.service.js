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

function presentRatingSummary(summary) {
  const plain = summary && typeof summary.toObject === "function"
    ? summary.toObject()
    : summary;
  const distribution = emptyDistribution();
  const source = plain?.distribution || {};
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

async function recomputePartnerRating(partnerId) {
  if (!partnerId) return presentRatingSummary(null);
  const groups = await Order.aggregate([
    {
      $match: {
        partner: toObjectId(partnerId),
        status: "DELIVERED",
        "rating.partnerRating": { $gte: 1, $lte: 5 }
      }
    },
    {
      $group: {
        _id: { $round: ["$rating.partnerRating", 0] },
        count: { $sum: 1 }
      }
    }
  ]);
  const summary = buildRatingSummary(groups);
  await Partner.updateOne({ _id: partnerId }, { $set: { ratingSummary: summary } });
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

  const ratingSummary = await recomputePartnerRating(order.partner);
  if (hasDriver) {
    await recomputeDeliveryAgentRating(order.deliveryAgent);
  }

  return {
    rating: order.rating,
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

  const ratingSummary = presentRatingSummary(partner.ratingSummary);
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
  recomputePartnerRating,
  recomputeDeliveryAgentRating,
  submitOrderRating,
  listKitchenReviews,
  backfillPartnerRatings
};
