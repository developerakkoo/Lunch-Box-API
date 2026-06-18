const router = require("express").Router();
const controller = require("../../controller/admin/support.controller");
const adminAuth = require("../../middlewares/adminAuth.middleware");

router.get("/support/tickets", adminAuth, controller.listTickets);
router.get("/support/tickets/:id", adminAuth, controller.getTicket);
router.get("/support/tickets/:id/messages", adminAuth, controller.getMessages);
router.post("/support/tickets/:id/messages", adminAuth, controller.sendMessage);
router.patch("/support/tickets/:id/assign", adminAuth, controller.assignTicket);
router.post("/support/tickets/:id/request-rating", adminAuth, controller.requestRating);
router.patch("/support/tickets/:id/close", adminAuth, controller.closeTicket);
router.patch("/support/tickets/:id/read", adminAuth, controller.markTicketRead);

router.get("/notifications/inbox", adminAuth, controller.getInbox);
router.patch("/notifications/inbox/:id/read", adminAuth, controller.markInboxRead);

module.exports = router;
