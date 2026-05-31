const mongoose = require("mongoose");
const { resolveAccessibleHotel } = require("../utils/partnerAccess");
const { logAudit } = require("../services/subscriptionAudit.service");
const {
  createPartnerPlan,
  updatePartnerPlan,
  getPartnerPlanById,
  listPartnerPlans,
  deactivatePartnerPlan
} = require("../services/subscriptionPlan.service");

function handleServiceError(res, err) {
  const status = err.status || 500;
  return res.status(status).json({
    message: err.message,
    code: err.code
  });
}

exports.listPlans = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const includeInactive = req.query.includeInactive === "true";
    const { menuItemId } = req.query;

    const plans = await listPartnerPlans(selectedHotel._id, {
      includeInactive,
      menuItemId
    });

    return res.status(200).json({ message: "Plans fetched", data: plans });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

exports.getPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const plan = await getPartnerPlanById(id, selectedHotel._id);
    return res.status(200).json({ message: "Plan fetched", data: plan });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

exports.createPlan = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const body = req.body || {};
    if (!body.title || !body.menuItemId || !body.durationInDays) {
      return res.status(400).json({
        message: "title, menuItemId, and durationInDays are required"
      });
    }

    const plan = await createPartnerPlan(selectedHotel._id, body);

    await logAudit({
      entityType: "SubscriptionPlan",
      entityId: plan._id,
      action: "CREATE",
      actorType: "PARTNER",
      actorId: req.partner?.id || req.user?.id,
      after: plan.toObject()
    });

    return res.status(201).json({ message: "Plan created", data: plan });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid plan id" });
    }

    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const before = await getPartnerPlanById(id, selectedHotel._id);
    const plan = await updatePartnerPlan(id, selectedHotel._id, req.body || {});

    await logAudit({
      entityType: "SubscriptionPlan",
      entityId: plan._id,
      action: "UPDATE",
      actorType: "PARTNER",
      actorId: req.partner?.id || req.user?.id,
      before: before.toObject(),
      after: plan.toObject()
    });

    return res.status(200).json({ message: "Plan updated", data: plan });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

exports.deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const plan = await deactivatePartnerPlan(id, selectedHotel._id);

    await logAudit({
      entityType: "SubscriptionPlan",
      entityId: plan._id,
      action: "DEACTIVATE",
      actorType: "PARTNER",
      actorId: req.partner?.id || req.user?.id,
      after: { isActive: false }
    });

    return res.status(200).json({ message: "Plan deactivated", data: plan });
  } catch (err) {
    return handleServiceError(res, err);
  }
};

exports.getSubscriptionStats = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const UserSubscription = require("../module/userSubscription.model");
    const SubscriptionDelivery = require("../module/subscriptionDelivery.model");

    const tomorrow = new Date(Date.now() + 86400000);
    const tStart = new Date(tomorrow);
    tStart.setHours(0, 0, 0, 0);
    const tEnd = new Date(tomorrow);
    tEnd.setHours(23, 59, 59, 999);
    const subIds = await UserSubscription.find({
      partnerId: selectedHotel._id,
      status: "ACTIVE"
    }).distinct("_id");

    const SubscriptionPlan = require("../module/subscriptionPlan.model");
    const [activeSubs, tomorrowCount, activePlans] = await Promise.all([
      UserSubscription.countDocuments({
        partnerId: selectedHotel._id,
        status: "ACTIVE"
      }),
      SubscriptionDelivery.countDocuments({
        userSubscriptionId: { $in: subIds },
        deliveryDate: { $gte: tStart, $lte: tEnd },
        status: { $in: ["PENDING", "PENDING_PARTNER"] }
      }),
      SubscriptionPlan.countDocuments({
        partnerId: selectedHotel._id,
        isActive: true
      })
    ]);

    return res.status(200).json({
      message: "Stats fetched",
      data: {
        activeSubscribers: activeSubs,
        tomorrowDeliveries: tomorrowCount,
        activePlans
      }
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
