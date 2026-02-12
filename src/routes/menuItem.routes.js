const router = require("express").Router();
const controller = require("../controller/menuItem.controller");
const partnerAuth = require("../middlewares/partnerAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Menu Item
 *   description: Partner Menu Management
 */


router.post("/create", partnerAuth, controller.createMenuItem);

router.get("/list", partnerAuth, controller.getMenuItems);

router.put("/update/:id", partnerAuth, controller.updateMenuItem);

router.delete("/delete/:id", partnerAuth, controller.deleteMenuItem);

module.exports = router;
