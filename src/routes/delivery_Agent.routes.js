const router = require("express").Router();
const controller = require("../controller/delivery_Agent.controller");
const driverAuth = require("../middlewares/driverAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Driver
 *   description: Delivery Driver APIs
 */

/**
 * @swagger
 * /api/delivery/register:
 *   post:
 *     summary: Register Driver
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverRegisterRequest'
 *     responses:
 *       201:
 *         description: Driver registered successfully
 */
router.post("/register", controller.registerDriver);

/**
 * @swagger
 * /api/delivery/login:
 *   post:
 *     summary: Driver Login
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverLoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", controller.loginDriver);

/**
 * @swagger
 * /api/delivery/profile:
 *   get:
 *     summary: Get driver profile
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver profile fetched
 */
router.get("/profile", driverAuth, controller.getProfile);

/**
 * @swagger
 * /api/delivery/profile:
 *   patch:
 *     summary: Update driver profile
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverProfileUpdateRequest'
 *     responses:
 *       200:
 *         description: Driver profile updated
 */
router.patch("/profile", driverAuth, controller.updateProfile);

/**
 * @swagger
 * /api/delivery/toggle-online:
 *   put:
 *     summary: Toggle driver online/offline
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver status updated
 */
router.put("/toggle-online", driverAuth, controller.toggleOnlineStatus);

/**
 * @swagger
 * /api/delivery/availability:
 *   patch:
 *     summary: Change availability status active/inactive
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverAvailabilityRequest'
 *     responses:
 *       200:
 *         description: Availability status updated
 */
router.patch("/availability", driverAuth, controller.updateAvailabilityStatus);

/**
 * @swagger
 * /api/delivery/update-location:
 *   put:
 *     summary: Update driver live location
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated successfully
 */
router.put("/update-location", driverAuth, controller.updateLiveLocation);

/**
 * @swagger
 * /api/delivery/orders:
 *   get:
 *     summary: View pending/running/completed orders
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PENDING, RUNNING, COMPLETED]
 *     responses:
 *       200:
 *         description: Orders fetched
 */
router.get("/orders", driverAuth, controller.getOrdersByDeliveryStatus);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/route:
 *   get:
 *     summary: Get route details to kitchen and customer
 *     tags: [Driver]
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
 *         description: Route details fetched
 */
router.get("/orders/:orderId/route", driverAuth, controller.getRouteDetails);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/customer-contact:
 *   get:
 *     summary: Contact customer via mobile dial-up
 *     tags: [Driver]
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
 *         description: Customer contact fetched
 */
router.get("/orders/:orderId/customer-contact", driverAuth, controller.getCustomerContact);

/**
 * @swagger
 * /api/delivery/accept-order/{orderId}:
 *   put:
 *     summary: Driver accept assigned order
 *     tags: [Driver]
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
 *         description: Order accepted successfully
 */
router.put("/accept-order/:orderId", driverAuth, controller.acceptOrder);

/**
 * @swagger
 * /api/delivery/reject-order/{orderId}:
 *   put:
 *     summary: Driver reject assigned order
 *     tags: [Driver]
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
 *         description: Order rejected successfully
 */
router.put("/reject-order/:orderId", driverAuth, controller.rejectOrder);

/**
 * @swagger
 * /api/delivery/pick-order/{orderId}:
 *   put:
 *     summary: Driver pick order
 *     tags: [Driver]
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
 *         description: Order picked successfully
 */
router.put("/pick-order/:orderId", driverAuth, controller.pickOrder);

/**
 * @swagger
 * /api/delivery/complete-order/{orderId}:
 *   put:
 *     summary: Driver complete order
 *     tags: [Driver]
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
 *         description: Order completed successfully
 */
router.put("/complete-order/:orderId", driverAuth, controller.completeOrder);

/**
 * @swagger
 * /api/delivery/notifications:
 *   get:
 *     summary: View delivery notifications
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications fetched
 */
router.get("/notifications", driverAuth, controller.getNotifications);

/**
 * @swagger
 * /api/delivery/notifications/{notificationId}/read:
 *   patch:
 *     summary: Mark delivery notification as read
 *     tags: [Driver]
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
router.patch("/notifications/:notificationId/read", driverAuth, controller.markNotificationRead);

/**
 * @swagger
 * /api/delivery/notifications/read-all:
 *   patch:
 *     summary: Mark all delivery notifications as read
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications marked as read
 */
router.patch("/notifications/read-all", driverAuth, controller.markAllNotificationsRead);

/**
 * @swagger
 * /api/delivery/dashboard:
 *   get:
 *     summary: Driver dashboard
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver dashboard data
 */
router.get("/dashboard", driverAuth, controller.getDashboard);

module.exports = router;
