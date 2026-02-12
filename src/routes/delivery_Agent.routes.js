const router = require("express").Router();
const controller = require("../controller/delivery_Agent.controller");
const driverAuth = require("../middlewares/driverAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Driver
 *   description: Delivery Driver APIs
 */


/*
|--------------------------------------------------------------------------
| DRIVER AUTH ROUTES
|--------------------------------------------------------------------------
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



/*
|--------------------------------------------------------------------------
| DRIVER PROTECTED ROUTES
|--------------------------------------------------------------------------
*/

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
 *                 example: 19.0760
 *               longitude:
 *                 type: number
 *                 example: 72.8777
 *     responses:
 *       200:
 *         description: Location updated successfully
 */
router.put("/update-location", driverAuth, controller.updateLiveLocation);



/**
 * @swagger
 * /api/delivery/accept-order/{orderId}:
 *   put:
 *     summary: Driver accept order
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order accepted successfully
 */
router.put("/accept-order/:orderId", driverAuth, controller.acceptOrder);



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
 *         description: Order ID
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
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order completed successfully
 */
router.put("/complete-order/:orderId", driverAuth, controller.completeOrder);



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
