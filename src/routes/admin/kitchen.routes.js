const router = require("express").Router();
const controller = require("../../controller/admin/admin.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Kitchen Management
 *   description: Admin kitchen control APIs
 */

/**
 * @swagger
 * /api/admin/kitchens:
 *   get:
 *     summary: Get all kitchens
 *     tags: [Kitchen Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of kitchens
 */
router.get("/kitchens", adminAuth, controller.getAllKitchens);


/**
 * @swagger
 * /api/admin/kitchen/status/{id}:
 *   put:
 *     summary: Toggle kitchen active/inactive status
 *     tags: [Kitchen Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Kitchen ID
 *     responses:
 *       200:
 *         description: Kitchen status updated successfully
 */
router.put("/kitchen/status/:id", adminAuth, controller.updateKitchenStatus);

module.exports = router;
