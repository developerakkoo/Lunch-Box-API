const mongoose = require("mongoose");
const PlatformNotification = require("../../module/platformNotification.model");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 30, 1);

    const [notifications, total] = await Promise.all([
      PlatformNotification.find()
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      PlatformNotification.countDocuments()
    ]);

    return res.status(200).json({
      message: "Notifications fetched",
      pagination: { page: pageNumber, limit: limitNumber, total },
      data: notifications
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.createNotification = async (req, res) => {
  try {
    const { title, message, audience = "all_users" } = req.body || {};

    if (!title || !message) {
      return res.status(400).json({ message: "Title and message are required" });
    }

    const notification = await PlatformNotification.create({
      title,
      message,
      audience,
      createdBy: req.admin?.id || null,
      sentAt: new Date()
    });

    return res.status(201).json({
      message: "Notification created",
      data: notification
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    const notification = await PlatformNotification.findByIdAndUpdate(
      id,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ message: "Marked as read", data: notification });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    const notification = await PlatformNotification.findByIdAndDelete(id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ message: "Notification deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
