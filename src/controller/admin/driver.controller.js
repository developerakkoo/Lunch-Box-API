const mongoose = require("mongoose");
const DeliveryAgent = require("../../module/Delivery_Agent");
const logger = require("../../utils/logger");
const { notifyDeliveryAgent } = require("../../utils/deliveryNotification");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const REJECT_REASON_MIN = 10;

exports.listDrivers = async (req, res) => {
  try {
    const {
      search = "",
      status,
      page = 1,
      limit = 20,
      includeDeleted = "false",
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const query = {};

    if (includeDeleted !== "true") {
      query.deletedAt = null;
    }

    if (status && ["PENDING", "APPROVED", "REJECTED", "BLOCKED"].includes(String(status))) {
      query.status = status;
    }

    if (search) {
      const regex = new RegExp(String(search).trim(), "i");
      query.$or = [
        { fullName: regex },
        { email: regex },
        { mobileNumber: regex },
      ];
    }

    const [data, total] = await Promise.all([
      DeliveryAgent.find(query)
        .select(
          "-password fullName email mobileNumber address status isOnline isAvailable createdAt rejectionReason reviewedAt deletedAt"
        )
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber)
        .lean(),
      DeliveryAgent.countDocuments(query),
    ]);

    return res.status(200).json({
      message: "Drivers fetched successfully",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data,
    });
  } catch (error) {
    logger.error("Admin list drivers failed", { message: error.message });
    return res.status(500).json({ message: error.message });
  }
};

exports.getDriverById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid driver id" });
    }

    const driver = await DeliveryAgent.findById(id)
      .select("-password")
      .populate("reviewedBy", "name email")
      .lean();

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    return res.status(200).json({
      message: "Driver fetched successfully",
      data: driver,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateDriver = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid driver id" });
    }

    const driver = await DeliveryAgent.findById(id);
    if (!driver || driver.deletedAt) {
      return res.status(404).json({ message: "Driver not found" });
    }

    const {
      fullName,
      mobileNumber,
      address,
      profileImage,
      vehicle,
      documents,
      status: nextStatus,
    } = req.body || {};

    if (fullName !== undefined) driver.fullName = fullName;
    if (mobileNumber !== undefined) driver.mobileNumber = mobileNumber;
    if (address !== undefined) driver.address = address;
    if (profileImage !== undefined) driver.profileImage = profileImage;
    if (vehicle !== undefined) driver.vehicle = vehicle;
    if (documents !== undefined) driver.documents = documents;

    if (nextStatus !== undefined) {
      if (nextStatus === "BLOCKED") {
        driver.status = "BLOCKED";
        driver.reviewedAt = new Date();
        driver.reviewedBy = req.admin?.id || null;
      } else {
        return res.status(400).json({
          message: "Only status BLOCKED can be set via this endpoint. Use approve or reject.",
        });
      }
    }

    await driver.save();

    return res.status(200).json({
      message: "Driver updated successfully",
      data: driver.toJSON(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.softDeleteDriver = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid driver id" });
    }

    const driver = await DeliveryAgent.findById(id);
    if (!driver || driver.deletedAt) {
      return res.status(404).json({ message: "Driver not found" });
    }

    driver.deletedAt = new Date();
    driver.isOnline = false;
    driver.isAvailable = false;
    await driver.save();

    return res.status(200).json({
      message: "Driver archived successfully",
      data: { id: driver._id, deletedAt: driver.deletedAt },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.approveDriver = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid driver id" });
    }

    const driver = await DeliveryAgent.findById(id);
    if (!driver || driver.deletedAt) {
      return res.status(404).json({ message: "Driver not found" });
    }

    if (driver.status === "BLOCKED") {
      return res.status(409).json({ message: "Cannot approve a blocked driver" });
    }

    if (driver.status === "APPROVED") {
      return res.status(409).json({ message: "Driver is already approved" });
    }

    driver.status = "APPROVED";
    driver.rejectionReason = "";
    driver.reviewedAt = new Date();
    driver.reviewedBy = req.admin?.id || null;
    await driver.save();

    await notifyDeliveryAgent({
      deliveryAgentId: driver._id,
      type: "ACCOUNT_APPROVED",
      title: "Account approved",
      message: "Your driver account is approved. You can go online and accept deliveries.",
      data: { status: "APPROVED" },
    });

    return res.status(200).json({
      message: "Driver approved successfully",
      data: driver.toJSON(),
    });
  } catch (error) {
    logger.error("Admin approve driver failed", { message: error.message });
    return res.status(500).json({ message: error.message });
  }
};

exports.rejectDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid driver id" });
    }

    if (!reason || String(reason).trim().length < REJECT_REASON_MIN) {
      return res.status(400).json({
        message: `Rejection reason is required (min ${REJECT_REASON_MIN} characters)`,
      });
    }

    const trimmed = String(reason).trim();

    const driver = await DeliveryAgent.findById(id);
    if (!driver || driver.deletedAt) {
      return res.status(404).json({ message: "Driver not found" });
    }

    if (driver.status === "BLOCKED") {
      return res.status(409).json({ message: "Cannot reject a blocked driver" });
    }

    driver.status = "REJECTED";
    driver.rejectionReason = trimmed;
    driver.reviewedAt = new Date();
    driver.reviewedBy = req.admin?.id || null;
    driver.isOnline = false;
    driver.isAvailable = false;
    await driver.save();

    await notifyDeliveryAgent({
      deliveryAgentId: driver._id,
      type: "ACCOUNT_REJECTED",
      title: "Registration not approved",
      message: trimmed,
      data: { reason: trimmed, status: "REJECTED" },
    });

    return res.status(200).json({
      message: "Driver rejected successfully",
      data: driver.toJSON(),
    });
  } catch (error) {
    logger.error("Admin reject driver failed", { message: error.message });
    return res.status(500).json({ message: error.message });
  }
};
