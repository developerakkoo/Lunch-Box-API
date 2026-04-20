const router = require("express").Router();
const controller = require("../../controller/category.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");
const { upload } = require("../../middlewares/upload.middleware");

/**
 * @swagger
 * tags:
 *   name: Admin Category
 *   description: Admin category management APIs
 */

/**
 * @swagger
 * /api/admin/category/list:
 *   get:
 *     summary: Get categories
 *     tags: [Admin Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: partnerId
 *         schema:
 *           type: string
 *         description: Optional partner id to filter categories
 *     responses:
 *       200:
 *         description: Categories fetched successfully
 */
router.get("/list", adminAuth, controller.getCategories);

/**
 * @swagger
 * /api/admin/category/create:
 *   post:
 *     summary: Create category
 *     tags: [Admin Category]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Fast Food
 *               description:
 *                 type: string
 *                 example: All fast food items
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Category created successfully
 */
router.post("/create", adminAuth, upload.single("image"), controller.createCategory);

/**
 * @swagger
 * /api/admin/category/update/{id}:
 *   put:
 *     summary: Update category
 *     tags: [Admin Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *       - in: query
 *         name: partnerId
 *         schema:
 *           type: string
 *         description: Optional partner id to scope the update
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Category updated successfully
 */
router.put("/update/:id", adminAuth, upload.single("image"), controller.updateCategory);

/**
 * @swagger
 * /api/admin/category/delete/{id}:
 *   delete:
 *     summary: Delete category
 *     tags: [Admin Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *       - in: query
 *         name: partnerId
 *         schema:
 *           type: string
 *         description: Optional partner id to scope the delete
 *     responses:
 *       200:
 *         description: Category deleted successfully
 */
router.delete("/delete/:id", adminAuth, controller.deleteCategory);

module.exports = router;
