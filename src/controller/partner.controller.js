const Partner = require("../module/partner.model");
const jwt = require("jsonwebtoken");
const Category = require("../module/category.model");
const MenuItem = require("../module/menuItem.model");
const AddonCategory = require("../module/addonCategory.model");
const AddonItem = require("../module/addonItem.model");
const Order = require("../module/order.model");
const UserSubscription = require("../module/userSubscription.model");
const SubscriptionDelivery = require("../module/subscriptionDelivery.model");
const PartnerNotification = require("../module/partnerNotification.model");
// const Review = require("../module/review.model");


const generateToken = (partner) => {
  return jwt.sign(
    { id: partner._id },
    process.env.ACCESS_SECRET,
    { expiresIn: "1d" }
  );
};



/* ================= REGISTER PARTNER ================= */

exports.registerPartner = async (req, res) => {
  try {

    const { kitchenName, ownerName, email, password } = req.body;

    const existing = await Partner.findOne({ email });
    if (existing) {
      return res.status(400).json({
        message: "Email already registered"
      });
    }

    const partner = await Partner.create({
      kitchenName,
      ownerName,
      email,
      password
    });

    res.status(201).json({
      message: "Partner registered successfully",
      data: partner
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



/* ================= LOGIN PARTNER ================= */

exports.loginPartner = async (req, res) => {
  try {

    const { email, password } = req.body;

    const partner = await Partner.findOne({ email });

    if (!partner) {
      return res.status(400).json({
        message: "Invalid email"
      });
    }

    const isMatch = await partner.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password"
      });
    }

    const token = generateToken(partner);

    res.json({
      message: "Login successful",
      token,
      partner
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getDashboardStats = async (req, res) => {

  try {

    const partnerId = req.partner.id;

    /* ---------- BASIC COUNTS ---------- */

    const [
      totalCategories,
      totalMenuItems,
      totalAddonCategories,
      totalAddonItems,
      totalNewOrders,
      totalCompletedOrders,
      totalCancelledOrders
    ] = await Promise.all([

      Category.countDocuments({ partner: partnerId }),

      MenuItem.countDocuments({ partner: partnerId }),

      AddonCategory.countDocuments({ partner: partnerId }),

      AddonItem.countDocuments({ partner: partnerId }),

      Order.countDocuments({
        partner: partnerId,
        status: "PLACED"
      }),

      Order.countDocuments({
        partner: partnerId,
        status: "DELIVERED"
      }),

      Order.countDocuments({
        partner: partnerId,
        status: "CANCELLED"
      })

    ]);


    /* ---------- TOTAL SALES ---------- */

    const totalSales = await Order.aggregate([
      {
        $match: {
          partner: partnerId,
          status: "DELIVERED"
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$priceDetails.totalAmount" }
        }
      }
    ]);


    /* ---------- BAR CHART SALES (LAST 7 DAYS) ---------- */

    const salesChart = await Order.aggregate([
      {
        $match: {
          partner: partnerId,
          status: "DELIVERED",
          createdAt: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          totalSales: { $sum: "$priceDetails.totalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);


    // /* ---------- RATINGS ---------- */

    // const ratings = await Review.aggregate([
    //   { $match: { partnerId } },
    //   {
    //     $group: {
    //       _id: null,
    //       avgRating: { $avg: "$rating" },
    //       totalReviews: { $sum: 1 }
    //     }
    //   }
    // ]);


    const ratingStats = await Order.aggregate([
      {
        $match: {
          partner: partnerId,
          "rating.partnerRating": { $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating.partnerRating" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    res.json({
      totalCategories,
      totalMenuItems,
      totalAddonCategories,
      totalAddonItems,
      totalNewOrders,
      totalCompletedOrders,
      totalCancelledOrders,
      totalSales: totalSales[0]?.total || 0,
      salesChart,
      averageRating: Number((ratingStats[0]?.averageRating || 0).toFixed(2)),
      totalReviews: ratingStats[0]?.totalReviews || 0
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOrdersByStatus = async (req, res) => {
  try {

    const partnerId = req.partner.id;
    const { status = "NEW" } = req.query;

    const statusMap = {
      NEW: ["PLACED", "ACCEPTED", "PREPARING", "READY"],
      CANCELLED: ["CANCELLED"],
      COMPLETED: ["DELIVERED"]
    };
    const mappedStatuses = statusMap[status] || [status];

    const orders = await Order.find({
      partner: partnerId,
      status: { $in: mappedStatuses }
    })
    .populate("user", "fullName mobileNumber")
    .populate("deliveryAgent", "fullName mobileNumber")
    .populate("items.menuItem", "name price image")
    .sort({ createdAt: -1 });

    res.json(orders);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.updateKitchenStatus = async (req, res) => {
  try {

    const partnerId = req.partner.id; // from partnerAuth middleware
    const { status } = req.body;

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Use ACTIVE or INACTIVE"
      });
    }

    const partner = await Partner.findById(partnerId);

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    partner.status = status;
    partner.isActive = status === "ACTIVE";

    await partner.save();

    res.json({
      message: "Kitchen status updated successfully",
      status: partner.status
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSubscriptionOrdersByStatus = async (req, res) => {
  try {
    const partnerId = req.partner.id;
    const { status = "NEW", page = 1, limit = 20 } = req.query;

    const statusMap = {
      NEW: ["PENDING"],
      CANCELLED: ["CANCELLED"],
      COMPLETED: ["DELIVERED"]
    };
    const mappedStatuses = statusMap[status] || [status];

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const subscriptions = await UserSubscription.find({ partnerId })
      .select("_id")
      .lean();

    const subscriptionIds = subscriptions.map((sub) => sub._id);

    const [deliveries, total] = await Promise.all([
      SubscriptionDelivery.find({
        userSubscriptionId: { $in: subscriptionIds },
        status: { $in: mappedStatuses }
      })
        .populate({
          path: "userSubscriptionId",
          populate: [
            { path: "userId", select: "fullName mobileNumber" },
            { path: "menuItemId", select: "name image price" },
            { path: "partnerId", select: "kitchenName" }
          ]
        })
        .sort({ deliveryDate: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      SubscriptionDelivery.countDocuments({
        userSubscriptionId: { $in: subscriptionIds },
        status: { $in: mappedStatuses }
      })
    ]);

    return res.status(200).json({
      message: "Subscription orders fetched successfully",
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total
      },
      data: deliveries
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getPartnerProfile = async (req, res) => {
  try {
    const partner = await Partner.findById(req.partner.id).select(
      "kitchenName ownerName email phone address latitude longitude isActive status"
    );

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    return res.status(200).json({
      message: "Profile fetched successfully",
      data: partner
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updatePartnerProfile = async (req, res) => {
  try {
    const {
      kitchenName,
      ownerName,
      phone,
      address,
      latitude,
      longitude
    } = req.body || {};

    const updatePayload = {};
    if (kitchenName !== undefined) updatePayload.kitchenName = kitchenName;
    if (ownerName !== undefined) updatePayload.ownerName = ownerName;
    if (phone !== undefined) updatePayload.phone = phone;
    if (address !== undefined) updatePayload.address = address;
    if (latitude !== undefined) updatePayload.latitude = latitude;
    if (longitude !== undefined) updatePayload.longitude = longitude;

    const partner = await Partner.findByIdAndUpdate(
      req.partner.id,
      { $set: updatePayload },
      { new: true }
    ).select("kitchenName ownerName email phone address latitude longitude isActive status");

    if (!partner) {
      return res.status(404).json({ message: "Partner not found" });
    }

    return res.status(200).json({
      message: "Profile updated successfully",
      data: partner
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getDeliveryContactForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      partner: req.partner.id
    }).populate("deliveryAgent", "fullName mobileNumber");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!order.deliveryAgent) {
      return res.status(404).json({ message: "Delivery agent not assigned yet" });
    }

    return res.status(200).json({
      message: "Delivery contact fetched successfully",
      data: {
        orderId: order._id,
        deliveryAgentId: order.deliveryAgent._id,
        fullName: order.deliveryAgent.fullName,
        mobileNumber: order.deliveryAgent.mobileNumber,
        dialUrl: `tel:${order.deliveryAgent.mobileNumber}`
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getPartnerNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const [notifications, total, unreadCount] = await Promise.all([
      PartnerNotification.find({ partnerId: req.partner.id })
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      PartnerNotification.countDocuments({ partnerId: req.partner.id }),
      PartnerNotification.countDocuments({ partnerId: req.partner.id, isRead: false })
    ]);

    return res.status(200).json({
      message: "Notifications fetched successfully",
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total
      },
      unreadCount,
      data: notifications
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await PartnerNotification.findOneAndUpdate(
      { _id: notificationId, partnerId: req.partner.id },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({
      message: "Notification marked as read",
      data: notification
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await PartnerNotification.updateMany(
      { partnerId: req.partner.id, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      message: "All notifications marked as read"
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
