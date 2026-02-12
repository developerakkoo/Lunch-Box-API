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
 *                 totalCategories:
 *                   type: number
 *                 totalKitchens:
 *                   type: number
 *                 totalDrivers:
 *                   type: number
 *                 pendingOrders:
 *                   type: number
 *                 processingOrders:
 *                   type: number
 *                 onRouteOrders:
 *                   type: number
 *                 completedOrders:
 *                   type: number
 *                 cancelledOrders:
 *                   type: number
 *                 totalSales:
 *                   type: number
 */
router.get("/", adminAuth, controller.getDashboard);

module.exports = router;
