const mongoose = require("mongoose");
const MenuItem = require("../module/menuItem.model");
const SubscriptionPlan = require("../module/subscriptionPlan.model");
const UserSubscription = require("../module/userSubscription.model");

const MIN_DURATION = 7;
const MAX_DURATION = 90;
const MIN_MEALS_PER_DAY = 1;
const MAX_MEALS_PER_DAY = 3;

const PLAN_CREATE_FIELDS = [
  "title",
  "description",
  "menuItemId",
  "planType",
  "durationInDays",
  "pricePerMeal",
  "totalPrice",
  "discountedPrice",
  "mealType",
  "mealTypes",
  "mealsPerDay",
  "deliveryTimeSlots",
  "weeklyAvailability",
  "maxPauseDays",
  "maxSkipCount",
  "skipCutoffHours",
  "cancellationPolicy",
  "autoRenewAllowed",
  "visibility",
  "images",
  "nutritionalInfo",
  "tags",
  "isVeg",
  "commissionOverridePercent",
  "isActive"
];

const PLAN_UPDATE_FIELDS = PLAN_CREATE_FIELDS.filter((f) => f !== "menuItemId");

function pickAllowed(body, allowed) {
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
      out[key] = body[key];
    }
  }
  return out;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

async function assertMenuItemOwnedByPartner(menuItemId, partnerId) {
  if (!mongoose.Types.ObjectId.isValid(menuItemId)) {
    const err = new Error("Invalid menu item id");
    err.status = 400;
    throw err;
  }
  const menuItem = await MenuItem.findOne({
    _id: menuItemId,
    partner: partnerId,
    isAvailable: true
  });
  if (!menuItem) {
    const err = new Error("Menu item not found or unavailable for this kitchen");
    err.status = 404;
    throw err;
  }
  return menuItem;
}

async function assertNoActivePlanForMenuItem(partnerId, menuItemId, excludePlanId = null) {
  const query = {
    partnerId,
    menuItemId,
    isActive: true
  };
  if (excludePlanId) {
    query._id = { $ne: excludePlanId };
  }
  const existing = await SubscriptionPlan.findOne(query).select("_id title");
  if (existing) {
    const err = new Error(
      "An active subscription plan already exists for this menu item. Deactivate it before creating another."
    );
    err.status = 409;
    err.code = "DUPLICATE_ACTIVE_PLAN";
    throw err;
  }
}

async function assertCanChangeMenuItem(planId) {
  const count = await UserSubscription.countDocuments({
    subscriptionPlanId: planId,
    status: { $in: ["ACTIVE", "PAUSED", "PENDING_PAYMENT"] }
  });
  if (count > 0) {
    const err = new Error("Cannot change menu item while subscribers are active on this plan");
    err.status = 400;
    throw err;
  }
}

function normalizePlanPayload(body, menuItem, { isCreate = false } = {}) {
  const raw = pickAllowed(body, isCreate ? PLAN_CREATE_FIELDS : PLAN_UPDATE_FIELDS);

  if (isCreate && !raw.menuItemId) {
    const err = new Error("menuItemId is required");
    err.status = 400;
    throw err;
  }

  const durationInDays = clamp(
    Number(raw.durationInDays) || 30,
    MIN_DURATION,
    MAX_DURATION
  );

  const menuPrice =
    menuItem.discountPrice > 0 && menuItem.discountPrice < menuItem.price
      ? menuItem.discountPrice
      : menuItem.price;

  const pricePerMeal = Math.max(0, Number(raw.pricePerMeal ?? menuPrice) || 0);
  let mealsPerDay = clamp(
    Number(raw.mealsPerDay) || 1,
    MIN_MEALS_PER_DAY,
    MAX_MEALS_PER_DAY
  );

  let mealType = raw.mealType || "LUNCH";
  let mealTypes = Array.isArray(raw.mealTypes) ? raw.mealTypes : [];
  if (mealType === "BOTH") {
    mealTypes = ["LUNCH", "DINNER"];
    mealsPerDay = Math.max(mealsPerDay, 2);
  } else if (mealTypes.length === 0) {
    mealTypes = [mealType === "BREAKFAST" ? "BREAKFAST" : mealType === "DINNER" ? "DINNER" : "LUNCH"];
  }

  const discountedPrice =
    raw.discountedPrice != null && raw.discountedPrice !== ""
      ? Math.max(0, Number(raw.discountedPrice))
      : undefined;

  const totalPrice =
    discountedPrice != null
      ? discountedPrice
      : raw.totalPrice != null && raw.totalPrice !== ""
        ? Math.max(0, Number(raw.totalPrice))
        : Math.round(pricePerMeal * durationInDays * 100) / 100;

  const normalized = {
    ...raw,
    title: (raw.title || `${menuItem.name} Plan`).trim(),
    description: raw.description?.trim?.() || raw.description,
    durationInDays,
    pricePerMeal,
    totalPrice,
    mealsPerDay,
    mealType,
    mealTypes,
    isVeg: raw.isVeg != null ? Boolean(raw.isVeg) : menuItem.isVeg,
    visibility: raw.visibility || "PUBLIC",
    autoRenewAllowed: raw.autoRenewAllowed !== false,
    isActive: raw.isActive !== false,
    planType: raw.planType || (durationInDays === 7 ? "WEEKLY" : durationInDays === 30 ? "MONTHLY" : "CUSTOM")
  };

  if (discountedPrice != null) {
    normalized.discountedPrice = discountedPrice;
  }

  if (typeof raw.deliveryTimeSlots === "string") {
    normalized.deliveryTimeSlots = raw.deliveryTimeSlots
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  delete normalized.menuItemId;
  return normalized;
}

async function populatePlanQuery(query) {
  return SubscriptionPlan.find(query)
    .populate("menuItemId", "name price discountPrice image isVeg isAvailable")
    .sort({ isActive: -1, createdAt: -1 });
}

async function getPartnerPlanById(planId, partnerId) {
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    const err = new Error("Invalid plan id");
    err.status = 400;
    throw err;
  }
  const plan = await SubscriptionPlan.findOne({ _id: planId, partnerId }).populate(
    "menuItemId",
    "name price discountPrice image isVeg isAvailable"
  );
  if (!plan) {
    const err = new Error("Subscription plan not found");
    err.status = 404;
    throw err;
  }
  return plan;
}

async function createPartnerPlan(partnerId, body) {
  const menuItemId = body.menuItemId;
  const menuItem = await assertMenuItemOwnedByPartner(menuItemId, partnerId);
  await assertNoActivePlanForMenuItem(partnerId, menuItemId);

  const payload = normalizePlanPayload(body, menuItem, { isCreate: true });
  const plan = await SubscriptionPlan.create({
    ...payload,
    partnerId,
    menuItemId
  });

  return getPartnerPlanById(plan._id, partnerId);
}

async function updatePartnerPlan(planId, partnerId, body) {
  const plan = await getPartnerPlanById(planId, partnerId);

  if (Object.prototype.hasOwnProperty.call(body || {}, "menuItemId")) {
    const nextMenuId = String(body.menuItemId);
    if (String(plan.menuItemId) !== nextMenuId) {
      await assertCanChangeMenuItem(planId);
      await assertMenuItemOwnedByPartner(nextMenuId, partnerId);
      plan.menuItemId = nextMenuId;
    }
  }

  const menuItem = await MenuItem.findById(plan.menuItemId);
  if (!menuItem) {
    const err = new Error("Linked menu item no longer exists");
    err.status = 400;
    throw err;
  }

  const willBeActive =
    body.isActive !== undefined ? Boolean(body.isActive) : plan.isActive;
  if (willBeActive) {
    await assertNoActivePlanForMenuItem(partnerId, plan.menuItemId, planId);
  }

  const payload = normalizePlanPayload(body, menuItem, { isCreate: false });
  Object.assign(plan, payload);
  await plan.save();

  return getPartnerPlanById(planId, partnerId);
}

async function listPartnerPlans(partnerId, { includeInactive = false, menuItemId } = {}) {
  const query = { partnerId };
  if (!includeInactive) {
    query.isActive = true;
  }
  if (menuItemId && mongoose.Types.ObjectId.isValid(menuItemId)) {
    query.menuItemId = menuItemId;
  }
  return populatePlanQuery(query);
}

async function deactivatePartnerPlan(planId, partnerId) {
  const plan = await getPartnerPlanById(planId, partnerId);
  plan.isActive = false;
  await plan.save();
  return plan;
}

module.exports = {
  PLAN_CREATE_FIELDS,
  PLAN_UPDATE_FIELDS,
  assertMenuItemOwnedByPartner,
  assertNoActivePlanForMenuItem,
  normalizePlanPayload,
  createPartnerPlan,
  updatePartnerPlan,
  getPartnerPlanById,
  listPartnerPlans,
  deactivatePartnerPlan
};
