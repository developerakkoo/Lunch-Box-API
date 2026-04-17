const Category = require("../../module/category.model");
const Partner = require("../../module/partner.model");
const DeliveryAgent = require("../../module/Delivery_Agent");
const Order = require("../../module/order.model");
const User = require("../../module/user.model");

exports.getDashboard = async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalCategories,
      totalKitchens,
      totalPartners,
      activeKitchens,
      inactiveKitchens,
      totalDrivers,
      approvedDrivers,
      totalUsers,
      placedOrders,
      acceptedOrders,
      preparingOrders,
      readyOrders,
      outForDeliveryOrders,
      completedOrders,
      cancelledOrders,
      totalSales,
      recentSales,
      recentOrders,
      latestKitchens,
      latestUsers,
      latestDrivers,
      paymentOverview,
      topKitchensRaw
    ] = await Promise.all([
      Category.countDocuments(),
      Partner.countDocuments(),
      Partner.countDocuments({ ownerPartner: null }),
      Partner.countDocuments({ status: "ACTIVE", isActive: true }),
      Partner.countDocuments({ status: "INACTIVE" }),
      DeliveryAgent.countDocuments(),
      DeliveryAgent.countDocuments({ status: "APPROVED" }),
      User.countDocuments(),
      Order.countDocuments({ status: "PLACED" }),
      Order.countDocuments({ status: "ACCEPTED" }),
      Order.countDocuments({ status: "PREPARING" }),
      Order.countDocuments({ status: "READY" }),
      Order.countDocuments({ status: "OUT_FOR_DELIVERY" }),
      Order.countDocuments({ status: "DELIVERED" }),
      Order.countDocuments({ status: "CANCELLED" }),
      Order.aggregate([
        { $match: { status: "DELIVERED" } },
        { $group: { _id: null, total: { $sum: "$priceDetails.totalAmount" } } }
      ]),
      Order.aggregate([
        {
          $match: {
            status: "DELIVERED",
            createdAt: { $gte: sevenDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
            },
            totalSales: { $sum: "$priceDetails.totalAmount" },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Order.find()
        .populate("user", "fullName mobileNumber email")
        .populate("partner", "kitchenName ownerName phone")
        .populate("deliveryAgent", "fullName mobileNumber")
        .sort({ createdAt: -1 })
        .limit(10),
      Partner.find()
        .populate("ownerPartner", "kitchenName ownerName email phone")
        .sort({ createdAt: -1 })
        .limit(5)
        .select("kitchenName ownerName email phone address status isActive ownerPartner createdAt"),
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("fullName email mobileNumber walletBalance referralCode createdAt"),
      DeliveryAgent.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("fullName email mobileNumber status isOnline isAvailable earnings createdAt"),
      Order.aggregate([
        {
          $group: {
            _id: {
              method: "$payment.method",
              paymentStatus: "$payment.paymentStatus"
            },
            totalOrders: { $sum: 1 },
            totalAmount: { $sum: "$priceDetails.totalAmount" }
          }
        },
        { $sort: { "_id.method": 1, "_id.paymentStatus": 1 } }
      ]),
      Order.aggregate([
        { $match: { status: "DELIVERED" } },
        {
          $group: {
            _id: "$partner",
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$priceDetails.totalAmount" }
          }
        },
        { $sort: { totalRevenue: -1, totalOrders: -1 } },
        { $limit: 5 }
      ])
    ]);

    const topKitchenIds = topKitchensRaw.map((item) => String(item._id));
    const topKitchenDocs = await Partner.find({ _id: { $in: topKitchenIds } })
      .select("kitchenName ownerName phone status isActive");
    const kitchenMap = new Map(topKitchenDocs.map((doc) => [String(doc._id), doc]));

    const topKitchens = topKitchensRaw.map((item) => ({
      kitchen: kitchenMap.get(String(item._id)) || null,
      totalOrders: item.totalOrders,
      totalRevenue: item.totalRevenue
    }));

    return res.json({
      summary: {
        totalCategories,
        totalKitchens,
        totalPartners,
        activeKitchens,
        inactiveKitchens,
        totalDrivers,
        approvedDrivers,
        totalUsers,
        totalSales: totalSales[0]?.total || 0
      },
      orderStats: {
        placed: placedOrders,
        accepted: acceptedOrders,
        preparing: preparingOrders,
        ready: readyOrders,
        outForDelivery: outForDeliveryOrders,
        completed: completedOrders,
        cancelled: cancelledOrders
      },
      recentSales,
      paymentOverview,
      topKitchens,
      recentOrders,
      latestKitchens,
      latestUsers,
      latestDrivers
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
