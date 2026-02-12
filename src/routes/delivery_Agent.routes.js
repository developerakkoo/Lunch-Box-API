const router = require("express").Router();
const controller = require("../controller/delivery_Agent.controller");
const auth = require("../middlewares/auth.middleware");

/**
 * @swagger
 * tags:
 *   name: Delivery Agent
 *   description: Delivery agent profile management APIs
 */


/**
 * @swagger
 * /api/delivery/create:
 *   post:
 *     summary: Create Delivery Agent Profile
 *     tags: [Delivery Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vehicleType:
 *                 type: string
 *                 example: Bike
 *               vehicleNumber:
 *                 type: string
 *                 example: MH12AB1234
 *               licenseNumber:
 *                 type: string
 *                 example: DL123456789
 *     responses:
 *       201:
 *         description: Delivery profile created successfully
 *       401:
 *         description: Unauthorized
 */
router.post("/create", auth, controller.createDeliveryProfile);

module.exports = router;
