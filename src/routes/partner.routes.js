// const router = require("express").Router();
// const controller = require("../controller/partner.controller");
// const auth = require("../middlewares/auth.middleware");
// const auth1 = require("../middlewares/partnerAuth.middleware");

// router.post("/register", controller.registerPartner);
// router.post("/login", controller.loginPartner);
// router.get("/dashboard", auth1, controller.getDashboardStats);
// module.exports = router;

const router = require('express').Router()
const controller = require('../controller/partner.controller')
const auth = require('../middlewares/partnerAuth.middleware')

/**
 * @swagger
 * tags:
 *   name: Partner
 */

/**
 * @swagger
 * /api/partner/register:
 *   post:
 *     summary: Partner Register
 *     tags: [Partner]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PartnerRegisterRequest'
 *     responses:
 *       201:
 *         description: Partner registered
 */
router.post('/register', controller.registerPartner)

/**
 * @swagger
 * /api/partner/login:
 *   post:
 *     summary: Partner Login
 *     tags: [Partner]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PartnerLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post('/login', controller.loginPartner)

/**
 * @swagger
 * /api/partner/dashboard:
 *   get:
 *     summary: Partner Dashboard
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 */
router.get('/dashboard', auth, controller.getDashboardStats)

/**
 * @swagger
 * /api/partner/orders:
 *   get:
 *     summary: View orders by status
 *     tags: [Partner Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [NEW, CANCELLED, COMPLETED]
 *         example: NEW
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 */
router.get('/orders', auth, controller.getOrdersByStatus)

/**
 * @swagger
 * /api/partner/kitchen/status:
 *   put:
 *     summary: Update kitchen active/inactive status
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *                 example: INACTIVE
 *     responses:
 *       200:
 *         description: Kitchen status updated successfully
 */
router.put('/kitchen/status', auth, controller.updateKitchenStatus)

module.exports = router
