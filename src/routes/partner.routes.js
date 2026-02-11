const router = require("express").Router();
const controller = require("../controller/partner.controller");
const auth = require("../middlewares/auth.middleware");
const auth1 = require("../middlewares/partnerAuth.middleware");


router.post("/register", controller.registerPartner);
router.post("/login", controller.loginPartner);
router.get("/dashboard", auth1, controller.getDashboardStats);
module.exports = router;
