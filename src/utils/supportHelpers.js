const mongoose = require("mongoose");
const SupportTicket = require("../module/supportTicket.model");
const SupportMessage = require("../module/supportMessage.model");
const User = require("../module/user.model");
const { notifyUser } = require("./userNotification");
const { notifyAdmin } = require("./adminNotification");

const OPEN_STATUSES = ["OPEN", "ACTIVE", "PENDING_RATING"];
const MAX_OPEN_TICKETS = 5;

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const generateTicketNumber = async () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await SupportTicket.countDocuments({
    createdAt: {
      $gte: new Date(new Date().setHours(0, 0, 0, 0))
    }
  });
  const seq = String(count + 1).padStart(4, "0");
  return `SUP-${datePart}-${seq}`;
};

const emitTicketUpdated = (ticket) => {
  if (!global.io || !ticket) return;
  const payload = ticket.toObject ? ticket.toObject() : ticket;
  global.io.to(`support_ticket_${ticket._id}`).emit("support_ticket_updated", payload);
  global.io.to("admin_support").emit("support_ticket_updated", payload);
  global.io.to(`user_${ticket.userId}`).emit("support_ticket_updated", payload);
};

const emitSupportMessage = (message, ticket) => {
  if (!global.io || !message) return;
  const payload = message.toObject ? message.toObject() : message;
  global.io.to(`support_ticket_${message.ticketId}`).emit("support_message", payload);
  if (ticket) {
    emitTicketUpdated(ticket);
  }
};

const getTicketForUser = async (ticketId, userId) => {
  if (!isValidObjectId(ticketId)) return null;
  return SupportTicket.findOne({ _id: ticketId, userId });
};

const getTicketForAdmin = async (ticketId) => {
  if (!isValidObjectId(ticketId)) return null;
  return SupportTicket.findById(ticketId).populate(
    "userId",
    "fullName mobileNumber email supportPresence"
  );
};

const appendMessage = async ({
  ticket,
  senderType,
  senderId,
  messageType = "TEXT",
  body,
  markReadForSender = true
}) => {
  const readByUser = senderType === "USER";
  const readByAdmin = senderType === "ADMIN";

  const message = await SupportMessage.create({
    ticketId: ticket._id,
    senderType,
    senderId: senderId || null,
    messageType,
    body,
    readByUser: senderType === "USER" || senderType === "ADMIN" ? readByUser : false,
    readByAdmin: senderType === "ADMIN" ? true : readByAdmin
  });

  const unreadByUserInc = senderType === "ADMIN" || senderType === "SYSTEM" ? 1 : 0;
  const unreadByAdminInc = senderType === "USER" ? 1 : 0;

  if (ticket.status === "OPEN" && senderType === "ADMIN") {
    ticket.status = "ACTIVE";
  }

  ticket.lastMessageAt = new Date();
  ticket.lastMessagePreview = body.slice(0, 200);
  ticket.unreadByUser += unreadByUserInc;
  ticket.unreadByAdmin += unreadByAdminInc;
  await ticket.save();

  return message;
};

const markTicketRead = async (ticket, readerType) => {
  const filter = { ticketId: ticket._id };
  const update = {};

  if (readerType === "USER") {
    filter.readByUser = false;
    update.readByUser = true;
    ticket.unreadByUser = 0;
  } else if (readerType === "ADMIN") {
    filter.readByAdmin = false;
    update.readByAdmin = true;
    ticket.unreadByAdmin = 0;
  }

  await SupportMessage.updateMany(filter, { $set: update });
  await ticket.save();
  emitTicketUpdated(ticket);
  return ticket;
};

const countOpenTickets = (userId) =>
  SupportTicket.countDocuments({ userId, status: { $in: OPEN_STATUSES } });

const formatTicket = (ticket) => {
  const obj = ticket.toObject ? ticket.toObject() : { ...ticket };
  if (obj.userId && typeof obj.userId === "object" && obj.userId._id) {
    obj.user = {
      id: obj.userId._id,
      fullName: obj.userId.fullName,
      mobileNumber: obj.userId.mobileNumber,
      email: obj.userId.email,
      supportPresence: obj.userId.supportPresence
    };
  }
  return obj;
};

module.exports = {
  OPEN_STATUSES,
  MAX_OPEN_TICKETS,
  isValidObjectId,
  generateTicketNumber,
  emitTicketUpdated,
  emitSupportMessage,
  getTicketForUser,
  getTicketForAdmin,
  appendMessage,
  markTicketRead,
  countOpenTickets,
  formatTicket
};
