const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const cartController = require("../../src/controller/cart.controller");

router.post("/add", auth, cartController.addToCart);

module.exports = router;
