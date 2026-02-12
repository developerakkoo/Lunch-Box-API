const Category = require("../../module/category.model");
const Partner = require("../../module/partner.model");
const DeliveryAgent = require("../../module/Delivery_Agent");
const Order = require("../../module/order.model");

exports.getDashboard = async (req, res) => {

  const totalSales = await Order.aggregate([
    { $match: { status: "DELIVERED" } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } }
  ]);

  res.json({
    totalCategories: await Category.countDocuments(),
    totalKitchens: await Partner.countDocuments(),
    totalDrivers: await DeliveryAgent.countDocuments(),

    pendingOrders: await Order.countDocuments({ status: "PENDING" }),
    processingOrders: await Order.countDocuments({ status: "PROCESSING" }),
    onRouteOrders: await Order.countDocuments({ status: "ON_ROUTE" }),
    completedOrders: await Order.countDocuments({ status: "DELIVERED" }),
    cancelledOrders: await Order.countDocuments({ status: "CANCELLED" }),

    totalSales: totalSales[0]?.total || 0
  });
};
