const mongoose = require("mongoose");
const UserSubscription = require("../../module/userSubscription.model");
const SubscriptionTransaction = require("../../module/subscriptionTransaction.model");
const SettlementBatch = require("../../module/settlementBatch.model");
const CorporateSubscription = require("../../module/corporateSubscription.model");
const PlatformSettings = require("../../module/platformSettings.model");
const {
  createWeeklySettlementBatches,
  updateSettlementStatus
} = require("../../services/settlement.service");

const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

exports.getPlatformSettings = async (req, res) => {
  try {
    let settings = await PlatformSettings.findOne({ key: "default" });
    if (!settings) settings = await PlatformSettings.create({ key: "default" });
    return res.status(200).json({ message: "Settings fetched", data: settings });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updatePlatformSettings = async (req, res) => {
  try {
    const settings = await PlatformSettings.findOneAndUpdate(
      { key: "default" },
      { $set: req.body },
      { new: true, upsert: true }
    );
    return res.status(200).json({ message: "Settings updated", data: settings });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getExtendedStats = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      active,
      newThisMonth,
      cancelledMonth,
      revenueAgg,
      commissionAgg,
      pendingSettlement
    ] = await Promise.all([
      UserSubscription.countDocuments({ status: "ACTIVE" }),
      UserSubscription.countDocuments({ createdAt: { $gte: monthStart } }),
      UserSubscription.countDocuments({
        status: "CANCELLED",
        updatedAt: { $gte: monthStart }
      }),
      UserSubscription.aggregate([
        { $match: { "payment.paymentStatus": "PAID" } },
        { $group: { _id: null, gmv: { $sum: "$totalPrice" } } }
      ]),
      SubscriptionTransaction.aggregate([
        { $match: { paymentStatus: "PAID" } },
        { $group: { _id: null, commission: { $sum: "$commissionAmount" } } }
      ]),
      SettlementBatch.countDocuments({ status: "PENDING" })
    ]);

    const gmv = revenueAgg[0]?.gmv || 0;
    const mrr = gmv / 12;
    const churnBase = active + cancelledMonth;
    const churnRate = churnBase ? (cancelledMonth / churnBase) * 100 : 0;

    const topRestaurants = await UserSubscription.aggregate([
      { $match: { status: "ACTIVE" } },
      { $group: { _id: "$partnerId", count: { $sum: 1 }, revenue: { $sum: "$totalPrice" } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    return res.status(200).json({
      message: "Extended stats fetched",
      data: {
        activeSubscriptions: active,
        newSubscriptions: newThisMonth,
        churnRate: Math.round(churnRate * 100) / 100,
        gmv,
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(mrr * 12 * 100) / 100,
        commissionRevenue: commissionAgg[0]?.commission || 0,
        settlementPending: pendingSettlement,
        topRestaurants
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listSettlements = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);
    const query = {};
    if (status) query.status = status;

    const [data, total] = await Promise.all([
      SettlementBatch.find(query)
        .populate("partnerId", "kitchenName ownerName")
        .sort({ weekStart: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      SettlementBatch.countDocuments(query)
    ]);

    return res.status(200).json({
      message: "Settlements fetched",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.runSettlementBatch = async (req, res) => {
  try {
    const result = await createWeeklySettlementBatches(req.body);
    return res.status(200).json({ message: "Settlement batches created", data: result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateSettlement = async (req, res) => {
  try {
    const { status, bankReference, failureReason } = req.body;
    const batch = await updateSettlementStatus(req.params.id, status, {
      bankReference,
      failureReason
    });
    return res.status(200).json({ message: "Settlement updated", data: batch });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.listCorporate = async (req, res) => {
  try {
    const list = await CorporateSubscription.find()
      .populate("partnerId", "kitchenName")
      .sort({ createdAt: -1 });
    return res.status(200).json({ message: "Corporate subscriptions fetched", data: list });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createCorporate = async (req, res) => {
  try {
    const corp = await CorporateSubscription.create({
      ...req.body,
      adminUserId: req.admin?.id
    });
    return res.status(201).json({ message: "Corporate subscription created", data: corp });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateCorporate = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const corp = await CorporateSubscription.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!corp) return res.status(404).json({ message: "Not found" });
    return res.status(200).json({ message: "Updated", data: corp });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
