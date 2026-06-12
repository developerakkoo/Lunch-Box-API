const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Admin = require("../../module/admin.model");
const Partner = require("../../module/partner.model");
const Category = require("../../module/category.model");
const MenuItem = require("../../module/menuItem.model");
const Order = require("../../module/order.model");
const { notifyPartner } = require("../../utils/partnerNotification");
const logger = require("../../utils/logger");
const {
  PARTNER_APPROVAL_STATUS,
  normalizeApprovalStatus
} = require("../../utils/partnerApproval");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const buildDocumentSummary = (documents = {}) => ({
  panCard: Boolean(documents.panCard?.url),
  gstCertificate: Boolean(documents.gstCertificate?.url),
  fssaiLicense: Boolean(documents.fssaiLicense?.url)
});

const requireApprovalReason = (reason) => {
  const trimmed = String(reason || "").trim();
  return trimmed.length >= 10 ? trimmed : null;
};

exports.registerAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await Admin.findOne({ email });

    if (exists) {
      return res.status(400).json({
        message: "Admin already exists"
      });
    }

    const admin = await Admin.create({
      name,
      email,
      password
    });

    return res.status(201).json({
      message: "Admin registered successfully",
      adminId: admin._id
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(401).json({ message: "Admin not found. Register first or check your email." });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET
    );

    return res.json({
      token,
      admin: { name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getAllKitchens = async (req, res) => {
  try {
    const {
      search = "",
      status,
      isActive,
      ownerPartner,
      approvalStatus,
      page = 1,
      limit = 20
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);
    const query = {};

    if (status) {
      query.status = status;
    }

    if (isActive !== undefined) {
      query.isActive = String(isActive) === "true";
    }

    if (approvalStatus && ["PENDING", "APPROVED", "REJECTED"].includes(String(approvalStatus).toUpperCase())) {
      query.approvalStatus = String(approvalStatus).toUpperCase();
    }

    if (ownerPartner === "ROOT") {
      query.ownerPartner = null;
    } else if (ownerPartner && isValidObjectId(ownerPartner)) {
      query.ownerPartner = ownerPartner;
    }

    if (search) {
      query.$or = [
        { kitchenName: { $regex: search, $options: "i" } },
        { ownerName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } }
      ];
    }

    const [kitchens, total] = await Promise.all([
      Partner.find(query)
        .populate("ownerPartner", "kitchenName ownerName email phone")
        .select("ownerPartner kitchenName ownerName email phone address latitude longitude isActive status approvalStatus rejectionReason reviewedAt reviewedBy gstApplicable documents createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      Partner.countDocuments(query)
    ]);

    const data = kitchens.map((kitchen) => {
      const plain = kitchen.toObject ? kitchen.toObject() : kitchen;
      return {
        ...plain,
        approvalStatus: normalizeApprovalStatus(plain.approvalStatus),
        documents: buildDocumentSummary(plain.documents)
      };
    });

    return res.status(200).json({
      message: "Kitchens fetched successfully",
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total
      },
      data
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getKitchenDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid kitchen id" });
    }

    const kitchen = await Partner.findById(id)
      .select("-password")
      .populate(
      "ownerPartner",
      "kitchenName ownerName email phone"
    ).populate("reviewedBy", "name email");

    if (!kitchen) {
      return res.status(404).json({ message: "Kitchen not found" });
    }

    const [
      totalCategories,
      totalMenuItems,
      totalOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue
    ] = await Promise.all([
      Category.countDocuments({ partner: id }),
      MenuItem.countDocuments({ partner: id }),
      Order.countDocuments({ partner: id }),
      Order.countDocuments({ partner: id, status: "DELIVERED" }),
      Order.countDocuments({ partner: id, status: "CANCELLED" }),
      Order.aggregate([
        { $match: { partner: kitchen._id, status: "DELIVERED" } },
        { $group: { _id: null, total: { $sum: "$priceDetails.totalAmount" } } }
      ])
    ]);

    return res.status(200).json({
      message: "Kitchen details fetched successfully",
      data: {
        kitchen,
        approval: {
          approvalStatus: normalizeApprovalStatus(kitchen.approvalStatus),
          rejectionReason: kitchen.rejectionReason || "",
          reviewedAt: kitchen.reviewedAt || null,
          reviewedBy: kitchen.reviewedBy || null
        },
        documents: kitchen.documents || {},
        stats: {
          totalCategories,
          totalMenuItems,
          totalOrders,
          deliveredOrders,
          cancelledOrders,
          totalRevenue: totalRevenue[0]?.total || 0
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateKitchenStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isActive } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid kitchen id" });
    }

    const kitchen = await Partner.findById(id).select("-password");

    if (!kitchen) {
      return res.status(404).json({ message: "Kitchen not found" });
    }

    if (status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return res.status(400).json({ message: "status must be ACTIVE or INACTIVE" });
      }
      if (status === "ACTIVE" && normalizeApprovalStatus(kitchen.approvalStatus) !== PARTNER_APPROVAL_STATUS.APPROVED) {
        return res.status(409).json({ message: "Only approved partners can be activated" });
      }
      kitchen.status = status;
      kitchen.isActive = status === "ACTIVE";
    } else if (isActive !== undefined) {
      kitchen.isActive = Boolean(isActive);
      kitchen.status = kitchen.isActive ? "ACTIVE" : "INACTIVE";
      if (kitchen.isActive && normalizeApprovalStatus(kitchen.approvalStatus) !== PARTNER_APPROVAL_STATUS.APPROVED) {
        return res.status(409).json({ message: "Only approved partners can be activated" });
      }
    } else {
      kitchen.isActive = !kitchen.isActive;
      kitchen.status = kitchen.isActive ? "ACTIVE" : "INACTIVE";
      if (kitchen.isActive && normalizeApprovalStatus(kitchen.approvalStatus) !== PARTNER_APPROVAL_STATUS.APPROVED) {
        return res.status(409).json({ message: "Only approved partners can be activated" });
      }
    }

    await kitchen.save();

    return res.status(200).json({
      message: "Kitchen status updated successfully",
      data: kitchen
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.approveKitchen = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid kitchen id" });
    }

    const kitchen = await Partner.findById(id).select("-password");
    if (!kitchen) {
      return res.status(404).json({ message: "Kitchen not found" });
    }

    if (normalizeApprovalStatus(kitchen.approvalStatus) === PARTNER_APPROVAL_STATUS.APPROVED) {
      return res.status(409).json({ message: "Kitchen is already approved" });
    }

    kitchen.approvalStatus = PARTNER_APPROVAL_STATUS.APPROVED;
    kitchen.rejectionReason = "";
    kitchen.reviewedAt = new Date();
    kitchen.reviewedBy = req.admin?.id || null;
    kitchen.isActive = true;
    kitchen.status = "ACTIVE";

    await kitchen.save();

    try {
      await notifyPartner({
        partnerId: kitchen._id,
        type: "ACCOUNT_APPROVED",
        title: "Partner approved",
        message: "Your partner registration has been approved. You can now log in.",
        data: {
          approvalStatus: PARTNER_APPROVAL_STATUS.APPROVED
        }
      });
    } catch (notifyError) {
      logger.warn("Partner approval notification failed", { message: notifyError.message, partnerId: kitchen._id });
    }

    return res.status(200).json({
      message: "Kitchen approved successfully",
      data: kitchen
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.rejectKitchen = async (req, res) => {
  try {
    const { id } = req.params;
    const rejectionReason = requireApprovalReason(req.body?.reason);

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid kitchen id" });
    }

    if (!rejectionReason) {
      return res.status(400).json({
        message: "Rejection reason is required and must be at least 10 characters"
      });
    }

    const kitchen = await Partner.findById(id);
    if (!kitchen) {
      return res.status(404).json({ message: "Kitchen not found" });
    }

    kitchen.approvalStatus = PARTNER_APPROVAL_STATUS.REJECTED;
    kitchen.rejectionReason = rejectionReason;
    kitchen.reviewedAt = new Date();
    kitchen.reviewedBy = req.admin?.id || null;
    kitchen.isActive = false;
    kitchen.status = "INACTIVE";

    await kitchen.save();

    try {
      await notifyPartner({
        partnerId: kitchen._id,
        type: "ACCOUNT_REJECTED",
        title: "Partner registration rejected",
        message: rejectionReason,
        data: {
          approvalStatus: PARTNER_APPROVAL_STATUS.REJECTED,
          rejectionReason
        }
      });
    } catch (notifyError) {
      logger.warn("Partner rejection notification failed", { message: notifyError.message, partnerId: kitchen._id });
    }

    return res.status(200).json({
      message: "Kitchen rejected successfully",
      data: kitchen
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select("-password");
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    return res.status(200).json({ data: admin });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body || {};
    const admin = await Admin.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    if (name) admin.name = name;
    if (email) admin.email = email;
    await admin.save();
    return res.status(200).json({
      message: "Profile updated",
      data: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password required" });
    }
    const admin = await Admin.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    const isMatch = await bcrypt.compare(currentPassword, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    admin.password = newPassword;
    await admin.save();
    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select("-password").sort({ createdAt: -1 });
    return res.status(200).json({ data: admins });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createAdminProtected = async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password required" });
    }
    const exists = await Admin.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "Admin already exists" });
    }
    const admin = await Admin.create({
      name,
      email,
      password,
      role: role === "SUB_ADMIN" ? "SUB_ADMIN" : "SUPER_ADMIN"
    });
    return res.status(201).json({
      message: "Admin created",
      data: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
