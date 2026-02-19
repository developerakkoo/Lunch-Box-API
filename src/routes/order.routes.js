const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const orderController = require("../controller/order.controller");

/**
 * @swagger
 * tags:
 *   name: Order
 *   description: Order APIs
 */

/**
 * @swagger
 * /api/order/create:
 *   post:
 *     summary: Create order from cart
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderCreateRequest'
 *     responses:
 *       200:
 *         description: Order created successfully
 *       400:
 *         description: Invalid request or cart empty
 */
router.post("/create", auth, orderController.createOrder);

/**
 * @swagger
 * /api/order/kitchen-action/{orderId}:
 *   patch:
 *     summary: Kitchen accepts or rejects order
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KitchenActionRequest'
 *     responses:
 *       200:
 *         description: Action updated
 *       404:
 *         description: Order not found
 */
router.patch("/kitchen-action/:orderId", auth, orderController.kitchenAction);

/**
 * @swagger
 * /api/order/delivery-action/{orderId}:
 *   patch:
 *     summary: Mark order as out for delivery
 *     tags: [Order]
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
 *         description: Delivery started
 *       404:
 *         description: Order not found
 */
router.patch("/delivery-action/:orderId", auth, orderController.deliveryAction);

/**
 * @swagger
 * /api/order/deliver/{orderId}:
 *   patch:
 *     summary: Mark order as delivered
 *     tags: [Order]
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
 *         description: Order delivered successfully
 *       404:
 *         description: Order not found
 */
router.patch("/deliver/:orderId", auth, orderController.markDelivered);

/**
 * @swagger
 * /api/order/confirm-payment:
 *   post:
 *     summary: Confirm Razorpay payment for an order
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfirmPaymentRequest'
 *     responses:
 *       200:
 *         description: Payment confirmed
 *       400:
 *         description: Invalid payment signature
 *       404:
 *         description: Order not found
 */
router.post('/confirm-payment', auth, orderController.confirmPayment);

/**
 * @swagger
 * /api/order/my-orders:
 *   get:
 *     summary: Get logged-in user's order history
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         example: DELIVERED
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         example: 20
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 */
router.get("/my-orders", auth, orderController.getMyOrders);

/**
 * @swagger
 * /api/order/my-orders/{orderId}:
 *   get:
 *     summary: Get logged-in user's order details
 *     tags: [Order]
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
 *       404:
 *         description: Order not found
 */
router.get("/my-orders/:orderId", auth, orderController.getMyOrderDetails);

/**
 * @swagger
 * /api/order/cancel/{orderId}:
 *   patch:
 *     summary: Cancel user's own order (policy based)
 *     tags: [Order]
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
 *             $ref: '#/components/schemas/OrderCancelRequest'
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       400:
 *         description: Order cannot be cancelled at current status
 */
router.patch("/cancel/:orderId", auth, orderController.cancelMyOrder);

/**
 * @swagger
 * /api/order/{orderId}/rate:
 *   post:
 *     summary: Rate/review a delivered order
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderRatingRequest'
 *     responses:
 *       200:
 *         description: Rating submitted
 */
router.post("/:orderId/rate", auth, orderController.rateOrder);

/**
 * @swagger
 * /api/order/{orderId}/tip:
 *   post:
 *     summary: Add tip to delivery partner during/after delivery
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderTipRequest'
 *     responses:
 *       200:
 *         description: Tip added or payment initiated
 */
router.post("/:orderId/tip", auth, orderController.addTipToOrder);

/**
 * @swagger
 * /api/order/{orderId}/tip/confirm:
 *   post:
 *     summary: Confirm pending tip payment
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TipPaymentConfirmRequest'
 *     responses:
 *       200:
 *         description: Tip payment confirmed
 */
router.post("/:orderId/tip/confirm", auth, orderController.confirmTipPayment);

module.exports = router;
