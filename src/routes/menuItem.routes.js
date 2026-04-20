const router = require("express").Router();
const controller = require("../controller/menuItem.controller");
const partnerAuth = require("../middlewares/partnerAuth.middleware");
const { upload } = require("../middlewares/upload.middleware");

/**
 * @swagger
 * tags:
 *   name: Menu Item
 *   description: Partner Menu Management
 */

/**
 * @swagger
 * /api/menuItem/create:
 *   post:
 *     summary: Create menu item
 *     tags: [Menu Item]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/MenuCreateRequest'
 *               - type: object
 *                 properties:
 *                   discountPrice:
 *                     type: number
 *                     example: 199
 *                   images:
 *                     type: array
 *                     items:
 *                       type: string
 *                       format: binary
 *                   hotelId:
 *                     type: string
 *                     example: "67e4b19f3b9d0e12ab345678"
 *     responses:
 *       201:
 *         description: Menu item created successfully
 */
router.post("/create", partnerAuth, upload.array("images", 10), controller.createMenuItem);

/**
 * @swagger
 * /api/menuItem/bulk:
 *   post:
 *     summary: Bulk create menu items
 *     tags: [Menu Item]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               hotelId:
 *                 type: string
 *                 example: "67e4b19f3b9d0e12ab345678"
 *               items:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/MenuCreateRequest'
 *     responses:
 *       201:
 *         description: Bulk menu items created successfully
 */
router.post("/bulk", partnerAuth, controller.bulkCreateMenuItems);

/**
 * @swagger
 * /api/menuItem/list:
 *   get:
 *     summary: List menu items
 *     tags: [Menu Item]
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
 *         description: Menu items fetched successfully
 */
router.get("/list", partnerAuth, controller.getMenuItems);

/**
 * @swagger
 * /api/menuItem/update/{id}:
 *   put:
 *     summary: Update menu item
 *     tags: [Menu Item]
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MenuCreateRequest'
 *     responses:
 *       200:
 *         description: Menu item updated successfully
 */
router.put("/update/:id", partnerAuth, upload.array("images", 10), controller.updateMenuItem);

/**
 * @swagger
 * /api/menuItem/delete/{id}:
 *   delete:
 *     summary: Delete menu item
 *     tags: [Menu Item]
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
 *         description: Menu item deleted successfully
 */
router.delete("/delete/:id", partnerAuth, controller.deleteMenuItem);

/**
 * @swagger
 * /api/menuItem/status/{id}:
 *   patch:
 *     summary: Toggle menu item availability
 *     tags: [Menu Item]
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
 *         description: Menu item status updated successfully
 */
router.patch("/status/:id", partnerAuth, controller.toggleMenuItemStatus);

module.exports = router;
