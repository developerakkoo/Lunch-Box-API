const router = require("express").Router();
const controller = require("../../controller/admin/notification.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

router.get("/notifications", adminAuth, controller.getNotifications);
router.post("/notifications", adminAuth, controller.createNotification);
router.patch("/notifications/:id/read", adminAuth, controller.markRead);
router.delete("/notifications/:id", adminAuth, controller.deleteNotification);

module.exports = router;
