const router = require("express").Router();
const controller = require("../../controller/admin/subscription.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

router.get("/subscriptions/stats", adminAuth, controller.getSubscriptionStats);
router.get("/subscriptions", adminAuth, controller.getSubscriptions);
router.get("/subscriptions/:id", adminAuth, controller.getSubscriptionById);
router.patch("/subscriptions/:id/status", adminAuth, controller.updateSubscriptionStatus);

module.exports = router;
