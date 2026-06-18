const mongoose = require("mongoose");
const SupportTicket = require("../../module/supportTicket.model");
const SupportMessage = require("../../module/supportMessage.model");
const UserNotification = require("../../module/userNotification.model");
const User = require("../../module/user.model");
const {
  MAX_OPEN_TICKETS,
  OPEN_STATUSES,
  isValidObjectId,
  generateTicketNumber,
  emitSupportMessage,
  emitTicketUpdated,
  getTicketForUser,
  appendMessage,
  markTicketRead,
  countOpenTickets,
  formatTicket
} = require("../../utils/supportHelpers");
const { notifyUser } = require("../../utils/userNotification");
const { notifyAdmin } = require("../../utils/adminNotification");

exports.createTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, category = "OTHER", message } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Subject and message are required" });
    }

    const openCount = await countOpenTickets(userId);
    if (openCount >= MAX_OPEN_TICKETS) {
      return res.status(400).json({
        message: `You can have at most ${MAX_OPEN_TICKETS} open support tickets`
      });
    }

    const ticketNumber = await generateTicketNumber();
    const ticket = await SupportTicket.create({
      ticketNumber,
      userId,
      subject: subject.trim(),
      category,
      status: "OPEN",
      lastMessagePreview: message.trim().slice(0, 200)
    });

    const firstMessage = await appendMessage({
      ticket,
      senderType: "USER",
      senderId: userId,
      body: message.trim(),
      markReadForSender: true
    });

    emitSupportMessage(firstMessage, ticket);

    const user = await User.findById(userId).select("fullName");
    await notifyAdmin({
      type: "SUPPORT_NEW_TICKET",
      title: "New support ticket",
      message: `${user?.fullName || "User"} opened ticket ${ticketNumber}`,
      data: { ticketId: String(ticket._id), userId: String(userId) }
    });

    return res.status(201).json({
      message: "Support ticket created",
      data: { ticket: formatTicket(ticket), message: firstMessage }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.listTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const filter = { userId };
    if (status === "open") {
      filter.status = { $in: OPEN_STATUSES };
    } else if (status === "resolved") {
      filter.status = { $in: ["RESOLVED", "CLOSED"] };
    } else if (status) {
      filter.status = status;
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      SupportTicket.countDocuments(filter)
    ]);

    return res.status(200).json({
      message: "Tickets fetched",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data: tickets.map(formatTicket)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getTicket = async (req, res) => {
  try {
    const ticket = await getTicketForUser(req.params.id, req.user.id);
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
    const ticket = await getTicketForUser(req.params.id, req.user.id);
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
    const ticket = await getTicketForUser(req.params.id, req.user.id);
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

    const message = await appendMessage({
      ticket,
      senderType: "USER",
      senderId: req.user.id,
      body: body.trim()
    });

    emitSupportMessage(message, ticket);

    await notifyAdmin({
      type: "SUPPORT_USER_REPLY",
      title: `Reply on ${ticket.ticketNumber}`,
      message: body.trim().slice(0, 120),
      data: { ticketId: String(ticket._id), userId: String(req.user.id) }
    });

    return res.status(201).json({ message: "Message sent", data: message });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.resolveTicket = async (req, res) => {
  try {
    const ticket = await getTicketForUser(req.params.id, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
      return res.status(400).json({ message: "Ticket already resolved" });
    }

    ticket.status = "RESOLVED";
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = "USER";
    await ticket.save();

    const statusMessage = await appendMessage({
      ticket,
      senderType: "SYSTEM",
      messageType: "STATUS_UPDATE",
      body: "User marked this ticket as resolved."
    });

    emitSupportMessage(statusMessage, ticket);

    await notifyAdmin({
      type: "SUPPORT_USER_RESOLVED",
      title: `Ticket resolved: ${ticket.ticketNumber}`,
      message: ticket.subject,
      data: { ticketId: String(ticket._id), userId: String(req.user.id) }
    });

    return res.status(200).json({ message: "Ticket resolved", data: formatTicket(ticket) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.submitRating = async (req, res) => {
  try {
    const ticket = await getTicketForUser(req.params.id, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status !== "PENDING_RATING" && !ticket.ratingRequestedAt) {
      return res.status(400).json({ message: "Rating not requested for this ticket" });
    }

    const { score, comment } = req.body;
    const ratingScore = Number(score);
    if (!ratingScore || ratingScore < 1 || ratingScore > 5) {
      return res.status(400).json({ message: "Rating score must be between 1 and 5" });
    }

    ticket.rating = {
      score: ratingScore,
      comment: comment?.trim() || "",
      submittedAt: new Date()
    };
    ticket.status = "RESOLVED";
    ticket.resolvedAt = new Date();
    ticket.resolvedBy = "USER";
    await ticket.save();

    const ratingMessage = await appendMessage({
      ticket,
      senderType: "SYSTEM",
      messageType: "RATING_SUBMITTED",
      body: JSON.stringify({ score: ratingScore, comment: comment?.trim() || "" })
    });

    emitSupportMessage(ratingMessage, ticket);

    return res.status(200).json({ message: "Rating submitted", data: formatTicket(ticket) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markTicketRead = async (req, res) => {
  try {
    const ticket = await getTicketForUser(req.params.id, req.user.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    await markTicketRead(ticket, "USER");
    return res.status(200).json({ message: "Marked as read", data: formatTicket(ticket) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 20, 1);

    const [notifications, total, unreadCount] = await Promise.all([
      UserNotification.find({ userId })
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      UserNotification.countDocuments({ userId }),
      UserNotification.countDocuments({ userId, isRead: false })
    ]);

    return res.status(200).json({
      message: "Notifications fetched",
      pagination: { page: pageNumber, limit: limitNumber, total },
      unreadCount,
      data: notifications
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const notification = await UserNotification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
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

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await UserNotification.updateMany(
      { userId: req.user.id, isRead: false },
      { $set: { isRead: true } }
    );
    return res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
