const router = require("express").Router();
const controller = require("../controller/partner.controller");
const auth = require("../middlewares/auth.middleware");

router.post("/create", auth, controller.createPartner);

module.exports = router;
