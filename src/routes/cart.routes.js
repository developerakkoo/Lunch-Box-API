const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const cartController = require("../../src/controller/cart.controller");

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Cart APIs
 */

/**
 * @swagger
 * /api/cart/add:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CartAddRequest'
 *     responses:
 *       200:
 *         description: Item added or cart updated
 *       401:
 *         description: Unauthorized
 */
router.post("/add", auth, cartController.addToCart);

/**
 * @swagger
 * /api/cart/checkout:
 *   post:
 *     summary: Checkout cart and apply coupon
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               couponCode:
 *                 type: string
 *                 example: WELCOME10
 *     responses:
 *       200:
 *         description: Checkout summary
 *       400:
 *         description: Invalid coupon or cart state
 */
router.post("/checkout", auth, cartController.checkout);

module.exports = router;
