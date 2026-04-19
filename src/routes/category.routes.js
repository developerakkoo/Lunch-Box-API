const router = require("express").Router();
const controller = require("../controller/category.controller");
const partnerAuth = require("../middlewares/partnerAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Category
 *   description: Partner category viewing
 */


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

module.exports = router;
