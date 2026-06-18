const SupportTicket = require("../../module/supportTicket.model");
const SupportMessage = require("../../module/supportMessage.model");
const AdminNotification = require("../../module/adminNotification.model");
const {
  OPEN_STATUSES,
  isValidObjectId,
  emitSupportMessage,
  getTicketForAdmin,
  appendMessage,
  markTicketRead,
  formatTicket
} = require("../../utils/supportHelpers");
const { notifyUser } = require("../../utils/userNotification");

exports.listTickets = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search, assigned } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const filter = {};
    if (status === "open") {
      filter.status = { $in: OPEN_STATUSES };
    } else if (status) {
      filter.status = status;
    }

    if (assigned === "me") {
      filter.assignedAdminId = req.admin.id;
    } else if (assigned === "unassigned") {
      filter.assignedAdminId = null;
    }

    if (search?.trim()) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [{ ticketNumber: regex }, { subject: regex }];
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate("userId", "fullName mobileNumber email supportPresence")
        .sort({ lastMessageAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      SupportTicket.countDocuments(filter)
    ]);

    return res.status(200).json({
      message: "Support tickets fetched",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data: tickets.map(formatTicket)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getTicket = async (req, res) => {
  try {
    const ticket = await getTicketForAdmin(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }
    return res.status(200).json({ message: "Ticket fetched", data: formatTicket(ticket) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const ticket = await getTicketForAdmin(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const { before, limit = 50 } = req.query;
    const limitNumber = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const filter = { ticketId: ticket._id };

    if (before && isValidObjectId(before)) {
      const beforeMsg = await SupportMessage.findById(before);
      if (beforeMsg) {
        filter.createdAt = { $lt: beforeMsg.createdAt };
      }
    }

    const messages = await SupportMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitNumber);

    return res.status(200).json({
      message: "Messages fetched",
      data: messages.reverse()
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const ticket = await getTicketForAdmin(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
      return res.status(400).json({ message: "Ticket is closed" });
    }

    const { body } = req.body;
    if (!body?.trim()) {
      return res.status(400).json({ message: "Message body is required" });
    }

    if (!ticket.assignedAdminId) {
      ticket.assignedAdminId = req.admin.id;
    }

    const message = await appendMessage({
      ticket,
      senderType: "ADMIN",
      senderId: req.admin.id,
      body: body.trim()
    });

    emitSupportMessage(message, ticket);

    await notifyUser({
      userId: ticket.userId._id || ticket.userId,
      type: "SUPPORT_NEW_REPLY",
      title: `Reply on ${ticket.ticketNumber}`,
      message: body.trim().slice(0, 120),
      data: {
        ticketId: String(ticket._id),
        route: `/support/${ticket._id}`
      }
    });

    return res.status(201).json({ message: "Message sent", data: message });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.assignTicket = async (req, res) => {
  try {
    const ticket = await getTicketForAdmin(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const adminId = req.body.adminId || req.admin.id;
    ticket.assignedAdminId = adminId;
    if (ticket.status === "OPEN") {
      ticket.status = "ACTIVE";
    }
    await ticket.save();

    return res.status(200).json({ message: "Ticket assigned", data: formatTicket(ticket) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.requestRating = async (req, res) => {
  try {
    const ticket = await getTicketForAdmin(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
      return res.status(400).json({ message: "Ticket is already closed" });
    }

    ticket.status = "PENDING_RATING";
    ticket.ratingRequestedAt = new Date();
    await ticket.save();

    const ratingMessage = await appendMessage({
      ticket,
      senderType: "SYSTEM",
      messageType: "RATING_REQUEST",
      body: "Please rate your support experience."
    });

    emitSupportMessage(ratingMessage, ticket);

    await notifyUser({
      userId: ticket.userId._id || ticket.userId,
      type: "SUPPORT_RATING_REQUEST",
      title: "Rate your support experience",
      message: `How was your experience with ticket ${ticket.ticketNumber}?`,
      data: {
        ticketId: String(ticket._id),
        route: `/support/${ticket._id}`
      }
    });

    return res.status(200).json({ message: "Rating requested", data: formatTicket(ticket) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.closeTicket = async (req, res) => {
  try {
    const ticket = await getTicketForAdmin(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    ticket.status = "CLOSED";
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = "ADMIN";
    await ticket.save();

    const statusMessage = await appendMessage({
      ticket,
      senderType: "SYSTEM",
      messageType: "STATUS_UPDATE",
      body: "Admin closed this ticket."
    });

    emitSupportMessage(statusMessage, ticket);

    await notifyUser({
      userId: ticket.userId._id || ticket.userId,
      type: "SUPPORT_TICKET_UPDATE",
      title: `Ticket closed: ${ticket.ticketNumber}`,
      message: ticket.subject,
      data: {
        ticketId: String(ticket._id),
        route: `/support/${ticket._id}`
      }
    });

    return res.status(200).json({ message: "Ticket closed", data: formatTicket(ticket) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markTicketRead = async (req, res) => {
  try {
    const ticket = await getTicketForAdmin(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    await markTicketRead(ticket, "ADMIN");
    return res.status(200).json({ message: "Marked as read", data: formatTicket(ticket) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getInbox = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const filter = {
      $or: [{ adminId: null }, { adminId: req.admin.id }]
    };

    const [notifications, total, unreadCount] = await Promise.all([
      AdminNotification.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      AdminNotification.countDocuments(filter),
      AdminNotification.countDocuments({ ...filter, isRead: false })
    ]);

    return res.status(200).json({
      message: "Inbox fetched",
      pagination: { page: pageNumber, limit: limitNumber, total },
      unreadCount,
      data: notifications
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markInboxRead = async (req, res) => {
  try {
    const notification = await AdminNotification.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ adminId: null }, { adminId: req.admin.id }]
      },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ message: "Notification marked as read", data: notification });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
