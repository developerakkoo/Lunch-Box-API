const router = require("express").Router();
const controller = require("../../controller/admin/order.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Admin Orders
 *   description: Admin order management APIs
 */

/**
 * @swagger
 * /api/admin/orders:
 *   get:
 *     summary: Get all orders with filters
 *     tags: [Admin Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *       - in: query
 *         name: partnerId
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: deliveryAgentId
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           example: 20
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 */
router.get("/orders", adminAuth, controller.getAllOrders);

/**
 * @swagger
 * /api/admin/orders/{orderId}:
 *   get:
 *     summary: Get admin order details
 *     tags: [Admin Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order details fetched successfully
 */
router.get("/orders/:orderId", adminAuth, controller.getOrderDetails);

/**
 * @swagger
 * /api/admin/orders/{orderId}/cancel:
 *   patch:
 *     summary: Force cancel an order
 *     tags: [Admin Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Customer issue resolved by admin
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 */
router.patch("/orders/:orderId/cancel", adminAuth, controller.cancelOrder);

module.exports = router;
