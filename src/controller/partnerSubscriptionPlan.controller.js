const mongoose = require("mongoose");
const SubscriptionPlan = require("../module/subscriptionPlan.model");
const UserSubscription = require("../module/userSubscription.model");
const { resolveAccessibleHotel } = require("../utils/partnerAccess");
const { logAudit } = require("../services/subscriptionAudit.service");

const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

exports.listPlans = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const plans = await SubscriptionPlan.find({ partnerId: selectedHotel._id })
      .populate("menuItemId", "name price image")
      .sort({ createdAt: -1 });

    return res.status(200).json({ message: "Plans fetched", data: plans });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.createPlan = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const body = req.body || {};
    if (!body.title || !body.menuItemId || !body.durationInDays) {
      return res.status(400).json({ message: "title, menuItemId, durationInDays required" });
    }

    const plan = await SubscriptionPlan.create({
      ...body,
      partnerId: selectedHotel._id,
      totalPrice: body.totalPrice ?? body.pricePerMeal * body.durationInDays
    });

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
    return res.status(500).json({ message: err.message });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid plan id" });

    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const plan = await SubscriptionPlan.findOne({ _id: id, partnerId: selectedHotel._id });
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    const allowed = [
      "title", "description", "durationInDays", "pricePerMeal", "totalPrice",
      "discountedPrice", "mealType", "mealTypes", "mealsPerDay", "deliveryTimeSlots",
      "weeklyAvailability", "maxPauseDays", "maxSkipCount", "skipCutoffHours",
      "cancellationPolicy", "autoRenewAllowed", "visibility", "images",
      "nutritionalInfo", "tags", "isVeg", "commissionOverridePercent", "isActive", "planType"
    ];
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        plan[key] = req.body[key];
      }
    }
    await plan.save();

    return res.status(200).json({ message: "Plan updated", data: plan });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.deletePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const plan = await SubscriptionPlan.findOneAndUpdate(
      { _id: id, partnerId: selectedHotel._id },
      { isActive: false },
      { new: true }
    );
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    return res.status(200).json({ message: "Plan deactivated", data: plan });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getSubscriptionStats = async (req, res) => {
  try {
    const { selectedHotel, error } = await resolveAccessibleHotel(req);
    if (error) return res.status(error.status).json({ message: error.message });

    const tomorrow = new Date(Date.now() + 86400000);
    const tStart = new Date(tomorrow);
    tStart.setHours(0, 0, 0, 0);
    const tEnd = new Date(tomorrow);
    tEnd.setHours(23, 59, 59, 999);
    const subIds = await UserSubscription.find({
      partnerId: selectedHotel._id,
      status: "ACTIVE"
    }).distinct("_id");

    const [activeSubs, tomorrowCount] = await Promise.all([
      UserSubscription.countDocuments({
        partnerId: selectedHotel._id,
        status: "ACTIVE"
      }),
      require("../module/subscriptionDelivery.model").countDocuments({
        userSubscriptionId: { $in: subIds },
        deliveryDate: { $gte: tStart, $lte: tEnd },
        status: { $in: ["PENDING", "PENDING_PARTNER"] }
      })
    ]);

    return res.status(200).json({
      message: "Stats fetched",
      data: { activeSubscribers: activeSubs, tomorrowDeliveries: tomorrowCount }
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
