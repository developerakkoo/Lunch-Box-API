const router = require("express").Router();
const controller = require("../controller/user.controller");
const auth = require("../middlewares/auth.middleware");

/**
 * @swagger
 * tags:
 *   name: User
 */

/**
 * @swagger
 * /api/user/login:
 *   post:
 *     summary: User Login / Register
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", controller.loginUser);


/**
 * @swagger
 * /api/user/profile:
 *   get:
 *     summary: Get User Profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
router.get("/profile", auth, controller.getProfile);

/* ===== ADD ADDRESS ===== */
router.post("/add-address", auth, controller.addAddress);

module.exports = router;
