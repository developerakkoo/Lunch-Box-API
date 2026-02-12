const router = require("express").Router();
const controller = require("../controller/addon.controller");
const partnerAuth = require("../middlewares/partnerAuth.middleware");

/**
 * @swagger
 * tags:
 *   name: Addons
 */


router.post("/category/create", partnerAuth, controller.createAddonCategory);

router.post("/item/create", partnerAuth, controller.createAddonItem);

router.get("/category/list", partnerAuth, controller.getAddonCategories);

router.get("/item/list", partnerAuth, controller.getAddonItems);

router.delete("/item/delete/:id", partnerAuth, controller.deleteAddonItem);

module.exports = router;
