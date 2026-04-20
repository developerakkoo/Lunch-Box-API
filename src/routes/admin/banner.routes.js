const router = require("express").Router();
const controller = require("../../controller/admin/banner.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");
const { upload } = require("../../middlewares/upload.middleware");

/**
 * @swagger
 * tags:
 *   name: Banner
 *   description: Admin banner management
 */

/**
 * @swagger
 * /api/admin/banner/create:
 *   post:
 *     summary: Create new banner
 *     tags: [Banner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - image
 *             properties:
 *               title:
 *                 type: string
 *                 example: Weekend Offer
 *               image:
 *                 type: string
 *                 format: binary
 *               redirectLink:
 *                 type: string
 *                 example: /offers
 *     responses:
 *       200:
 *         description: Banner created successfully
 */
router.post("/create", adminAuth, upload.single("image"), controller.createBanner);


/**
 * @swagger
 * /api/admin/banner/list:
 *   get:
 *     summary: Get all banners
 *     tags: [Banner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of banners
 */
router.get("/list", adminAuth, controller.getBanners);


/**
 * @swagger
 * /api/admin/banner/{id}:
 *   delete:
 *     summary: Delete banner
 *     tags: [Banner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Banner ID
 *     responses:
 *       200:
 *         description: Banner deleted successfully
 */
router.delete("/:id", adminAuth, controller.deleteBanner);

module.exports = router;
