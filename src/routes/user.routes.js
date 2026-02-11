const router = require("express").Router();

const controller = require("../controller/user.controller");
const auth = require("../../src/middlewares/auth.middleware");

router.post("/login", controller.loginUser);
router.post("/refresh-token", controller.refreshAccessToken);

router.get("/profile", auth, controller.getProfile);

module.exports = router;
