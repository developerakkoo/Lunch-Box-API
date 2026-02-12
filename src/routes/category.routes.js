const router = require("express").Router();
const controller = require("../controller/category.controller");
const partnerAuth = require("../middlewares/partnerAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Category
 *   description: Partner Category Management
 */


/**
 * @swagger
 * /api/category/create:
 *   post:
 *     summary: Create Category
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
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
 *     responses:
 *       201:
 *         description: Category created successfully
 *       400:
 *         description: Invalid request
 */
router.post("/create", partnerAuth, controller.createCategory);



/**
 * @swagger
 * /api/category/list:
 *   get:
 *     summary: Get All Categories
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get("/list", partnerAuth, controller.getCategories);



/**
 * @swagger
 * /api/category/update/{id}:
 *   put:
 *     summary: Update Category
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Beverages
 *               description:
 *                 type: string
 *                 example: Drinks and juices
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       404:
 *         description: Category not found
 */
router.put("/update/:id", partnerAuth, controller.updateCategory);



/**
 * @swagger
 * /api/category/delete/{id}:
 *   delete:
 *     summary: Delete Category
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     responses:
 *       200:
 *         description: Category deleted successfully
 *       404:
 *         description: Category not found
 */
router.delete("/delete/:id", partnerAuth, controller.deleteCategory);

module.exports = router;
