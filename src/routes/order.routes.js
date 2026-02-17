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

module.exports = router;
