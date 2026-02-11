const router = require("express").Router();
const controller = require("../controller/delivery_Agent.controller");
const auth = require("../middlewares/auth.middleware");

router.post("/create", auth, controller.createDeliveryProfile);

module.exports = router;
