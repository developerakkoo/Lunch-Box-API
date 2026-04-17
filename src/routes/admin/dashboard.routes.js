const router = require("express").Router();
const controller = require("../../controller/admin/dashboard.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Admin Dashboard
 *   description: Admin dashboard overview APIs
 */

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard overview
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalCategories:
 *                       type: number
 *                     totalKitchens:
 *                       type: number
 *                     totalPartners:
 *                       type: number
 *                     activeKitchens:
 *                       type: number
 *                     inactiveKitchens:
 *                       type: number
 *                     totalDrivers:
 *                       type: number
 *                     approvedDrivers:
 *                       type: number
 *                     totalUsers:
 *                       type: number
 *                     totalSales:
 *                       type: number
 *                 orderStats:
 *                   type: object
 *                   properties:
 *                     placed:
 *                       type: number
 *                     accepted:
 *                       type: number
 *                     preparing:
 *                       type: number
 *                     ready:
 *                       type: number
 *                     outForDelivery:
 *                       type: number
 *                     completed:
 *                       type: number
 *                     cancelled:
 *                       type: number
 *                 recentSales:
 *                   type: array
 *                   items:
 *                     type: object
 *                 paymentOverview:
 *                   type: array
 *                   items:
 *                     type: object
 *                 topKitchens:
 *                   type: array
 *                   items:
 *                     type: object
 *                 recentOrders:
 *                   type: array
 *                   items:
 *                     type: object
 *                 latestKitchens:
 *                   type: array
 *                   items:
 *                     type: object
 *                 latestUsers:
 *                   type: array
 *                   items:
 *                     type: object
 *                 latestDrivers:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get("/", adminAuth, controller.getDashboard);

module.exports = router;
