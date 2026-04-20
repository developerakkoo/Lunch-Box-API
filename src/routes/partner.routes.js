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
 * /api/partner/hotels:
 *   post:
 *     summary: Create a new hotel for the logged-in partner
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kitchenName]
 *             properties:
 *               kitchenName:
 *                 type: string
 *                 example: "Spicy House Baner22"
 *               ownerName:
 *                 type: string
 *                 example: "Rahul"
 *               phone:
 *                 type: string
 *                 example: "9876543211"
 *               address:
 *                 type: string
 *                 example: "Baner, Pune"
 *               latitude:
 *                 type: number
 *                 example: 18.559
 *               longitude:
 *                 type: number
 *                 example: 73.7868
 *     responses:
 *       201:
 *         description: Hotel created successfully
 */
router.post('/hotels', auth, controller.createHotel)

/**
 * @swagger
 * /api/partner/hotels:
 *   get:
 *     summary: List all hotels managed by the logged-in partner
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hotels fetched successfully
 */
router.get('/hotels', auth, controller.getManagedHotels)

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
 *     summary: List kitchen orders by segment (or legacy status)
 *     tags: [Partner Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *         description: Selected kitchen id (optional if only one)
 *       - in: query
 *         name: segment
 *         schema:
 *           type: string
 *           enum: [new, ongoing, completed, cancelled]
 *         description: Preferred filter; defaults to new when segment and status omitted
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [NEW, CANCELLED, COMPLETED]
 *         description: Legacy filter (ignored if segment is set). NEW includes PLACED through OUT_FOR_DELIVERY
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 *       400:
 *         description: Invalid segment
 */
router.get('/orders', auth, controller.getOrdersByStatus)

/**
 * @swagger
 * /api/partner/orders/summary:
 *   get:
 *     summary: Order counts per segment for the selected kitchen
 *     tags: [Partner Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Counts for new, ongoing, completed, cancelled
 */
router.get('/orders/summary', auth, controller.getKitchenOrdersSummary)

/**
 * @swagger
 * /api/partner/subscription-orders:
 *   get:
 *     summary: View subscription orders by status
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
 *         description: Subscription orders fetched successfully
 */
router.get('/subscription-orders', auth, controller.getSubscriptionOrdersByStatus)

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

/**
 * @swagger
 * /api/partner/profile:
 *   get:
 *     summary: Get kitchen owner profile
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 */
router.get('/profile', auth, controller.getPartnerProfile)

/**
 * @swagger
 * /api/partner/profile:
 *   patch:
 *     summary: Update kitchen owner profile
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PartnerProfileUpdateRequest'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.patch('/profile', auth, controller.updatePartnerProfile)

/**
 * @swagger
 * /api/partner/orders/{orderId}/delivery-contact:
 *   get:
 *     summary: Get delivery boy contact for order dial-up
 *     tags: [Partner Orders]
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
 *         description: Delivery contact fetched successfully
 */
router.get('/orders/:orderId/delivery-contact', auth, controller.getDeliveryContactForOrder)

/**
 * @swagger
 * /api/partner/orders/{orderId}:
 *   get:
 *     summary: Get a single order for the kitchen
 *     tags: [Partner Orders]
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
 *         description: Order details
 *       404:
 *         description: Order not found
 */
router.get('/orders/:orderId', auth, controller.getPartnerOrderById)

/**
 * @swagger
 * /api/partner/notifications:
 *   get:
 *     summary: View all kitchen notifications
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications fetched successfully
 */
router.get('/notifications', auth, controller.getPartnerNotifications)

/**
 * @swagger
 * /api/partner/notifications/{notificationId}/read:
 *   patch:
 *     summary: Mark single notification as read
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.patch('/notifications/:notificationId/read', auth, controller.markNotificationRead)

/**
 * @swagger
 * /api/partner/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Partner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.patch('/notifications/read-all', auth, controller.markAllNotificationsRead)

module.exports = router
