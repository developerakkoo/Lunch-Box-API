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
 *     summary: Get all kitchens with filters
 *     tags: [Kitchen Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE]
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: ownerPartner
 *         schema:
 *           type: string
 *         description: Use partner id or ROOT for primary owner accounts
 *       - in: query
 *         name: approvalStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED]
 *         description: Filter by partner approval state
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           example: 20
 *     responses:
 *       200:
 *         description: Kitchens fetched successfully
 */
router.get("/kitchens", adminAuth, controller.getAllKitchens);

/**
 * @swagger
 * /api/admin/kitchens/{id}:
 *   get:
 *     summary: Get kitchen details with stats
 *     tags: [Kitchen Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Kitchen details fetched successfully
 */
router.get("/kitchens/:id", adminAuth, controller.getKitchenDetails);

/**
 * @swagger
 * /api/admin/kitchen/status/{id}:
 *   put:
 *     summary: Update or toggle kitchen status
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
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Kitchen status updated successfully
 */
router.put("/kitchen/status/:id", adminAuth, controller.updateKitchenStatus);

/**
 * @swagger
 * /api/admin/kitchens/{id}/approve:
 *   post:
 *     summary: Approve a partner registration
 *     tags: [Kitchen Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Kitchen approved successfully
 */
router.post("/kitchens/:id/approve", adminAuth, controller.approveKitchen);

/**
 * @swagger
 * /api/admin/kitchens/{id}/reject:
 *   post:
 *     summary: Reject a partner registration
 *     tags: [Kitchen Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Missing valid FSSAI document
 *     responses:
 *       200:
 *         description: Kitchen rejected successfully
 */
router.post("/kitchens/:id/reject", adminAuth, controller.rejectKitchen);

module.exports = router;
