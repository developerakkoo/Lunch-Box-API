const router = require("express").Router();

const controller = require("../controller/order.controller");

const userAuth = require("../middlewares/auth.middleware");
const partnerAuth = require("../middlewares/partnerAuth.middleware");


// USER
router.post("/create", userAuth, controller.createOrder);


// PARTNER
router.put("/accept/:orderId", partnerAuth, controller.acceptOrder);
router.put("/reject/:orderId", partnerAuth, controller.rejectOrder);
router.put("/ready/:orderId", partnerAuth, controller.readyOrder);


// DELIVERY
router.put("/assign/:orderId", partnerAuth, controller.assignDelivery);
router.put("/pick/:orderId", userAuth, controller.pickOrder);
router.put("/complete/:orderId", userAuth, controller.completeOrder);

module.exports = router;
