const router = require("express").Router();
const controller = require("../../controller/admin/subscription.controller");
const enterprise = require("../../controller/admin/subscriptionEnterprise.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

router.get("/subscriptions/stats", adminAuth, controller.getSubscriptionStats);
router.get("/subscriptions/analytics", adminAuth, enterprise.getExtendedStats);
router.get("/subscriptions", adminAuth, controller.getSubscriptions);
router.patch(
  "/subscriptions/:subscriptionId/deliveries/:deliveryId",
  adminAuth,
  controller.updateSubscriptionDelivery
);
router.get("/subscriptions/:id", adminAuth, controller.getSubscriptionById);
router.patch("/subscriptions/:id/status", adminAuth, controller.updateSubscriptionStatus);

router.get("/platform-settings", adminAuth, enterprise.getPlatformSettings);
router.patch("/platform-settings", adminAuth, enterprise.updatePlatformSettings);

router.get("/settlements", adminAuth, enterprise.listSettlements);
router.post("/settlements/run", adminAuth, enterprise.runSettlementBatch);
router.patch("/settlements/:id", adminAuth, enterprise.updateSettlement);

router.get("/corporate-subscriptions", adminAuth, enterprise.listCorporate);
router.post("/corporate-subscriptions", adminAuth, enterprise.createCorporate);
router.patch("/corporate-subscriptions/:id", adminAuth, enterprise.updateCorporate);

module.exports = router;
