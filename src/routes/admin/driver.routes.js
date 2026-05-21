const router = require("express").Router();
const controller = require("../../controller/admin/driver.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

router.get("/drivers", adminAuth, controller.listDrivers);
router.get("/drivers/:id", adminAuth, controller.getDriverById);
router.patch("/drivers/:id", adminAuth, controller.updateDriver);
router.delete("/drivers/:id", adminAuth, controller.softDeleteDriver);
router.post("/drivers/:id/approve", adminAuth, controller.approveDriver);
router.post("/drivers/:id/reject", adminAuth, controller.rejectDriver);

module.exports = router;
