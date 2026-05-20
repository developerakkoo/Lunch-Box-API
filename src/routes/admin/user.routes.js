const router = require("express").Router();
const controller = require("../../controller/admin/user.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

router.get("/users", adminAuth, controller.getUsers);
router.get("/users/:id", adminAuth, controller.getUserById);
router.patch("/users/:id/block", adminAuth, controller.setUserBlocked);
router.delete("/users/:id", adminAuth, controller.deleteUser);

module.exports = router;
