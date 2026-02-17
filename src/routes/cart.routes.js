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

module.exports = router;
