const router = require("express").Router();
const controller = require("../../controller/admin/admin.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

router.get("/profile", adminAuth, controller.getProfile);
router.patch("/profile", adminAuth, controller.updateProfile);
router.patch("/password", adminAuth, controller.changePassword);
router.get("/admins", adminAuth, controller.listAdmins);
router.post("/admins", adminAuth, controller.createAdminProtected);

module.exports = router;
