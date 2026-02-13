const Partner = require("../module/partner.model");
const jwt = require("jsonwebtoken");
const Category = require("../module/category.model");
const MenuItem = require("../module/menuItem.model");
const AddonCategory = require("../module/addonCategory.model");
const AddonItem = require("../module/addonItem.model");
const Order = require("../module/order.model");
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

      Category.countDocuments({ partnerId }),

      MenuItem.countDocuments({ partnerId }),

      AddonCategory.countDocuments({ partnerId }),

      AddonItem.countDocuments({ partnerId }),

      Order.countDocuments({
        partnerId,
        orderStatus: "NEW"
      }),

      Order.countDocuments({
        partnerId,
        orderStatus: "DELIVERED"
      }),

      Order.countDocuments({
        partnerId,
        orderStatus: "CANCELLED"
      })

    ]);


    /* ---------- TOTAL SALES ---------- */

    const totalSales = await Order.aggregate([
      {
        $match: {
          partnerId,
          orderStatus: "DELIVERED"
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" }
        }
      }
    ]);


    /* ---------- BAR CHART SALES (LAST 7 DAYS) ---------- */

    const salesChart = await Order.aggregate([
      {
        $match: {
          partnerId,
          orderStatus: "DELIVERED",
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
          totalSales: { $sum: "$totalAmount" }
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
    //   averageRating: ratings[0]?.avgRating || 0,
    //   totalReviews: ratings[0]?.totalReviews || 0
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOrdersByStatus = async (req, res) => {
  try {

    const partnerId = req.partner.id;
    const { status } = req.query;

    const orders = await Order.find({
      partner: partnerId,
      status: status
    })
    .populate("customer", "name mobileNumber")
    .populate("items.product", "name price");

    res.json(orders);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

