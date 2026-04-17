const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Admin = require("../../module/admin.model");
const Partner = require("../../module/partner.model");
const Category = require("../../module/category.model");
const MenuItem = require("../../module/menuItem.model");
const Order = require("../../module/order.model");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

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
      return res.status(404).json({ message: "Admin not found" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET
    );

    return res.json({ token });
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
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      Partner.countDocuments(query)
    ]);

    return res.status(200).json({
      message: "Kitchens fetched successfully",
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total
      },
      data: kitchens
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

    const kitchen = await Partner.findById(id).populate(
      "ownerPartner",
      "kitchenName ownerName email phone"
    );

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

    const kitchen = await Partner.findById(id);

    if (!kitchen) {
      return res.status(404).json({ message: "Kitchen not found" });
    }

    if (status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return res.status(400).json({ message: "status must be ACTIVE or INACTIVE" });
      }
      kitchen.status = status;
      kitchen.isActive = status === "ACTIVE";
    } else if (isActive !== undefined) {
      kitchen.isActive = Boolean(isActive);
      kitchen.status = kitchen.isActive ? "ACTIVE" : "INACTIVE";
    } else {
      kitchen.isActive = !kitchen.isActive;
      kitchen.status = kitchen.isActive ? "ACTIVE" : "INACTIVE";
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
