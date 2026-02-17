const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const orderController = require("../controller/order.controller");

router.post("/create", auth, orderController.createOrder);

router.patch("/kitchen-action/:orderId", auth, orderController.kitchenAction);

router.patch("/delivery-action/:orderId", auth, orderController.deliveryAction);

router.patch("/deliver/:orderId", auth, orderController.markDelivered);
router.post('/confirm-payment', auth, orderController.confirmPayment);

module.exports = router;
