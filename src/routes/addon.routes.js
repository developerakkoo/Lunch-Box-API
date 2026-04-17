const router = require("express").Router();
const controller = require("../controller/addon.controller");
const partnerAuth = require("../middlewares/partnerAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Addons
 */

/**
 * @swagger
 * /api/addon/category/create:
 *   post:
 *     summary: Create addon category
 *     tags: [Addons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/AddonCategoryCreateRequest'
 *               - type: object
 *                 properties:
 *                   hotelId:
 *                     type: string
 *                     example: "67e4b19f3b9d0e12ab345678"
 *     responses:
 *       201:
 *         description: Addon category created
 */
router.post("/category/create", partnerAuth, controller.createAddonCategory);

/**
 * @swagger
 * /api/addon/item/create:
 *   post:
 *     summary: Create addon item
 *     tags: [Addons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/AddonItemCreateRequest'
 *               - type: object
 *                 properties:
 *                   hotelId:
 *                     type: string
 *                     example: "67e4b19f3b9d0e12ab345678"
 *     responses:
 *       201:
 *         description: Addon item created
 */
router.post("/item/create", partnerAuth, controller.createAddonItem);

/**
 * @swagger
 * /api/addon/category/list:
 *   get:
 *     summary: List addon categories
 *     tags: [Addons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *         description: Optional hotel id for multi-hotel partners
 *     responses:
 *       200:
 *         description: Addon categories fetched successfully
 */
router.get("/category/list", partnerAuth, controller.getAddonCategories);

/**
 * @swagger
 * /api/addon/item/list:
 *   get:
 *     summary: List addon items
 *     tags: [Addons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *         description: Optional hotel id for multi-hotel partners
 *     responses:
 *       200:
 *         description: Addon items fetched successfully
 */
router.get("/item/list", partnerAuth, controller.getAddonItems);

/**
 * @swagger
 * /api/addon/item/delete/{id}:
 *   delete:
 *     summary: Delete addon item
 *     tags: [Addons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: hotelId
 *         schema:
 *           type: string
 *         description: Optional hotel id for multi-hotel partners
 *     responses:
 *       200:
 *         description: Addon deleted
 */
router.delete("/item/delete/:id", partnerAuth, controller.deleteAddonItem);

module.exports = router;
