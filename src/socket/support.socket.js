const jwt = require("jsonwebtoken");
const { getIO } = require("./socket");
const SupportTicket = require("../module/supportTicket.model");
const {
  getTicketForUser,
  getTicketForAdmin,
  appendMessage,
  markTicketRead,
  emitSupportMessage
} = require("../utils/supportHelpers");
const { notifyUser } = require("../utils/userNotification");
const { notifyAdmin } = require("../utils/adminNotification");
const { setUserOffline } = require("../utils/supportPresence");
const logger = require("../utils/logger");

const getSocketActor = async (socket) => {
  if (socket.data.actor) return socket.data.actor;

  const token = socket.handshake.auth?.token;
  const role = socket.handshake.auth?.role;
  if (!token || !role) return null;

  try {
    if (role === "USER") {
      const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
      socket.data.actor = { role, id: decoded.id };
      return socket.data.actor;
    }

    if (role === "ADMIN") {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.actor = { role, id: decoded.id };
      return socket.data.actor;
    }
  } catch (error) {
    return null;
  }

  return null;
};

const requireActor = async (socket, allowedRoles) => {
  const actor = await getSocketActor(socket);
  if (!actor || !allowedRoles.includes(actor.role)) {
    return { error: { status: "error", message: "Unauthorized socket action" } };
  }
  return { actor };
};

const resolveTicketAccess = async (ticketId, actor) => {
  if (actor.role === "USER") {
    return getTicketForUser(ticketId, actor.id);
  }
  if (actor.role === "ADMIN") {
    return getTicketForAdmin(ticketId);
  }
  return null;
};

const supportSocketHandler = () => {
  const io = getIO();
  logger.info("Support socket handler initialized");

  io.on("connection", (socket) => {
    socket.on("disconnect", async () => {
      const actor = socket.data.actor;
      if (actor?.role === "USER") {
        await setUserOffline(actor.id);
      }
    });

    socket.on("join_support_admin", async (_payload, callback) => {
      const { actor, error } = await requireActor(socket, ["ADMIN"]);
      if (error) return callback && callback(error);
      socket.join("admin_support");
      logger.info("Admin joined support pool", { adminId: actor.id });
      callback && callback({ status: "ok" });
    });

    socket.on("join_support_ticket", async (ticketId, callback) => {
      const { actor, error } = await requireActor(socket, ["USER", "ADMIN"]);
      if (error) return callback && callback(error);

      const ticket = await resolveTicketAccess(ticketId, actor);
      if (!ticket) {
        return callback && callback({ status: "error", message: "Ticket access denied" });
      }

      socket.join(`support_ticket_${ticketId}`);
      callback && callback({ status: "ok" });
    });

    socket.on("leave_support_ticket", async (ticketId) => {
      if (ticketId) {
        socket.leave(`support_ticket_${ticketId}`);
      }
    });

    socket.on("support_send_message", async (payload, callback) => {
      try {
        const { actor, error } = await requireActor(socket, ["USER", "ADMIN"]);
        if (error) return callback && callback(error);

        const { ticketId, body } = payload || {};
        if (!ticketId || !body?.trim()) {
          return callback && callback({ status: "error", message: "Invalid message payload" });
        }

        const ticket = await resolveTicketAccess(ticketId, actor);
        if (!ticket) {
          return callback && callback({ status: "error", message: "Ticket not found" });
        }

        if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
          return callback && callback({ status: "error", message: "Ticket is closed" });
        }

        if (actor.role === "ADMIN" && !ticket.assignedAdminId) {
          ticket.assignedAdminId = actor.id;
        }

        const message = await appendMessage({
          ticket,
          senderType: actor.role === "USER" ? "USER" : "ADMIN",
          senderId: actor.id,
          body: body.trim()
        });

        emitSupportMessage(message, ticket);

        if (actor.role === "USER") {
          await notifyAdmin({
            type: "SUPPORT_USER_REPLY",
            title: `Reply on ${ticket.ticketNumber}`,
            message: body.trim().slice(0, 120),
            data: { ticketId: String(ticket._id), userId: String(actor.id) }
          });
        } else {
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
        }

        callback && callback({ status: "ok", data: message });
      } catch (err) {
        callback && callback({ status: "error", message: err.message });
      }
    });

    socket.on("support_typing", async (payload) => {
      const { actor, error } = await requireActor(socket, ["USER", "ADMIN"]);
      if (error) return;

      const { ticketId, isTyping } = payload || {};
      if (!ticketId) return;

      socket.to(`support_ticket_${ticketId}`).emit("support_typing", {
        ticketId,
        senderType: actor.role === "USER" ? "USER" : "ADMIN",
        senderId: String(actor.id),
        isTyping: Boolean(isTyping)
      });
    });

    socket.on("support_mark_read", async (payload, callback) => {
      try {
        const { actor, error } = await requireActor(socket, ["USER", "ADMIN"]);
        if (error) return callback && callback(error);

        const { ticketId } = payload || {};
        const ticket = await resolveTicketAccess(ticketId, actor);
        if (!ticket) {
          return callback && callback({ status: "error", message: "Ticket not found" });
        }

        await markTicketRead(ticket, actor.role === "USER" ? "USER" : "ADMIN");
        callback && callback({ status: "ok" });
      } catch (err) {
        callback && callback({ status: "error", message: err.message });
      }
    });
  });
};

module.exports = {
  supportSocketHandler
};
