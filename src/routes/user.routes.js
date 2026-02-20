const router = require("express").Router();
const controller = require("../controller/user.controller");
const subscriptionController = require("../controller/subscription.controller");
const auth = require("../middlewares/auth.middleware");

/**
 * @swagger
 * tags:
 *   name: User
 *   description: User APIs
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
 * /api/user/nearby-kitchens:
 *   get:
 *     summary: Get active kitchens for customer home screen (supports nearby search)
 *     tags: [User]
 *     parameters:
 *       - in: query
 *         name: latitude
 *         schema:
 *           type: number
 *         example: 18.5204
 *       - in: query
 *         name: longitude
 *         schema:
 *           type: number
 *         example: 73.8567
 *       - in: query
 *         name: radiusKm
 *         schema:
 *           type: number
 *         example: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         example: spicy
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
 *         description: Kitchens fetched successfully
 */
router.get("/nearby-kitchens", controller.getNearbyKitchens);

/**
 * @swagger
 * /api/user/kitchen/{kitchenId}/menu:
 *   get:
 *     summary: Get kitchen profile and available menu for customers
 *     tags: [User]
 *     parameters:
 *       - in: path
 *         name: kitchenId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Kitchen menu fetched successfully
 *       404:
 *         description: Kitchen not found
 */
router.get("/kitchen/:kitchenId/menu", controller.getKitchenMenuForCustomer);

/**
 * @swagger
 * /api/user/menu-item/{menuItemId}:
 *   get:
 *     summary: Get menu item details for customer product detail page
 *     tags: [User]
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Menu item details fetched successfully
 *       404:
 *         description: Menu item not found
 */
router.get("/menu-item/:menuItemId", controller.getMenuItemDetailsForCustomer);

/**
 * @swagger
 * /api/user/offers:
 *   get:
 *     summary: Get active public offers/banners for customer app
 *     tags: [User]
 *     responses:
 *       200:
 *         description: Offers fetched successfully
 */
router.get("/offers", controller.getPublicOffers);


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

/**
 * @swagger
 * /api/user/profile:
 *   patch:
 *     summary: Update user profile and language preferences (RTL/LTR)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserProfileUpdateRequest'
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid input
 */
router.patch("/profile", auth, controller.updateProfile);

/**
 * @swagger
 * /api/user/add-address:
 *   post:
 *     summary: Add user address
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserAddressCreateRequest'
 *     responses:
 *       201:
 *         description: Address added successfully
 *       401:
 *         description: Unauthorized
 */
router.post("/add-address", auth, controller.addAddress);

/**
 * @swagger
 * /api/user/addresses:
 *   get:
 *     summary: Get all user addresses
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses fetched successfully
 */
router.get("/addresses", auth, controller.getAddresses);

/**
 * @swagger
 * /api/user/address/{addressId}:
 *   put:
 *     summary: Update user address
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserAddressUpdateRequest'
 *     responses:
 *       200:
 *         description: Address updated successfully
 */
router.put("/address/:addressId", auth, controller.updateAddress);

/**
 * @swagger
 * /api/user/address/{addressId}:
 *   delete:
 *     summary: Delete user address
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Address deleted successfully
 */
router.delete("/address/:addressId", auth, controller.deleteAddress);

/**
 * @swagger
 * /api/user/address/{addressId}/default:
 *   patch:
 *     summary: Set default user address
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Default address updated successfully
 */
router.patch("/address/:addressId/default", auth, controller.setDefaultAddress);

/**
 * @swagger
 * /api/user/wallet:
 *   get:
 *     summary: Get wallet balance
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet summary fetched successfully
 */
router.get("/wallet", auth, controller.getWalletSummary);

/**
 * @swagger
 * /api/user/wallet/transactions:
 *   get:
 *     summary: Get wallet transactions
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet transactions fetched
 */
router.get("/wallet/transactions", auth, controller.getWalletTransactions);

/**
 * @swagger
 * /api/user/wallet/topup/create:
 *   post:
 *     summary: Create wallet topup payment request using Razorpay/Stripe
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WalletTopupCreateRequest'
 *     responses:
 *       200:
 *         description: Topup payment created
 */
router.post("/wallet/topup/create", auth, controller.createWalletTopup);

/**
 * @swagger
 * /api/user/wallet/topup/confirm:
 *   post:
 *     summary: Confirm wallet topup payment
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WalletTopupConfirmRequest'
 *     responses:
 *       200:
 *         description: Topup confirmed
 */
router.post("/wallet/topup/confirm", auth, controller.confirmWalletTopup);

/**
 * @swagger
 * /api/user/referral:
 *   get:
 *     summary: Get referral code and reward rules
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral info fetched
 */
router.get("/referral", auth, controller.getReferralInfo);

/**
 * @swagger
 * /api/user/referral/apply:
 *   post:
 *     summary: Apply referral code for logged-in user
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApplyReferralRequest'
 *     responses:
 *       200:
 *         description: Referral code applied
 */
router.post("/referral/apply", auth, controller.applyReferralCode);

/**
 * @swagger
 * /api/user/favorites:
 *   get:
 *     summary: Get favorite kitchens
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Favorite kitchens fetched
 */
router.get("/favorites", auth, controller.getFavoriteKitchens);

/**
 * @swagger
 * /api/user/favorites/{kitchenId}:
 *   post:
 *     summary: Add kitchen to favorites
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: kitchenId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Kitchen added to favorites
 */
router.post("/favorites/:kitchenId", auth, controller.addFavoriteKitchen);

/**
 * @swagger
 * /api/user/favorites/{kitchenId}:
 *   delete:
 *     summary: Remove kitchen from favorites
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: kitchenId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Kitchen removed from favorites
 */
router.delete("/favorites/:kitchenId", auth, controller.removeFavoriteKitchen);

/**
 * @swagger
 * /api/user/subscriptions/plans:
 *   get:
 *     summary: List subscription plans by kitchen/menu item
 *     tags: [User]
 *     parameters:
 *       - in: query
 *         name: kitchenId
 *         schema:
 *           type: string
 *       - in: query
 *         name: menuItemId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Subscription plans fetched
 */
router.get("/subscriptions/plans", subscriptionController.listPlans);

/**
 * @swagger
 * /api/user/subscriptions/purchase:
 *   post:
 *     summary: Purchase subscription plan
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubscriptionPurchaseRequest'
 *     responses:
 *       201:
 *         description: Subscription purchase initiated
 */
router.post("/subscriptions/purchase", auth, subscriptionController.purchaseSubscription);

/**
 * @swagger
 * /api/user/subscriptions/{subscriptionId}/confirm-payment:
 *   post:
 *     summary: Confirm subscription payment (Razorpay/Stripe)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubscriptionPaymentConfirmRequest'
 *     responses:
 *       200:
 *         description: Subscription payment confirmed
 */
router.post(
  "/subscriptions/:subscriptionId/confirm-payment",
  auth,
  subscriptionController.confirmSubscriptionPayment
);

/**
 * @swagger
 * /api/user/subscriptions/history:
 *   get:
 *     summary: Get subscription history
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription history fetched
 */
router.get("/subscriptions/history", auth, subscriptionController.getSubscriptionHistory);

/**
 * @swagger
 * /api/user/subscriptions/upcoming-deliveries:
 *   get:
 *     summary: Get upcoming subscription deliveries
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Upcoming deliveries fetched
 */
router.get(
  "/subscriptions/upcoming-deliveries",
  auth,
  subscriptionController.getUpcomingSubscriptionDeliveries
);

module.exports = router;
