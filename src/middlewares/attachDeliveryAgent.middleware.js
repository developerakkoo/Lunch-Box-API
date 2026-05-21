const DeliveryAgent = require("../module/Delivery_Agent");

/**
 * After driverAuth: load DeliveryAgent doc onto req.deliveryAgent.
 * Password remains on doc for saves; JSON responses omit it via schema toJSON.
 */
module.exports = async (req, res, next) => {
  try {
    const id = req.driver?.id;
    if (!id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const agent = await DeliveryAgent.findById(id);
    if (!agent) {
      return res.status(404).json({ message: "Agent profile not found" });
    }
    if (agent.deletedAt) {
      return res.status(403).json({
        message: "This account is no longer active.",
        code: "ACCOUNT_DELETED",
      });
    }
    req.deliveryAgent = agent;
    next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
