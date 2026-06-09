const DeliveryAgent = require("../module/Delivery_Agent");
const { getDriverApprovalGate } = require("../utils/driverApproval");

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

    if (req.deliveryAgent && String(req.deliveryAgent._id || req.deliveryAgent.id) === String(id)) {
      const approvalGate = getDriverApprovalGate(req.deliveryAgent);
      if (!approvalGate.allowed) {
        return res.status(403).json({
          message: approvalGate.message,
          code: approvalGate.code,
          status: approvalGate.status,
          rejectionReason: approvalGate.rejectionReason || undefined,
        });
      }
      return next();
    }

    const agent = await DeliveryAgent.findById(id).select("-password");
    if (!agent) {
      return res.status(404).json({ message: "Agent profile not found" });
    }
    if (agent.deletedAt) {
      return res.status(403).json({
        message: "This account is no longer active.",
        code: "ACCOUNT_DELETED",
      });
    }
    const approvalGate = getDriverApprovalGate(agent);
    if (!approvalGate.allowed) {
      return res.status(403).json({
        message: approvalGate.message,
        code: approvalGate.code,
        status: approvalGate.status,
        rejectionReason: approvalGate.rejectionReason || undefined,
      });
    }
    req.deliveryAgent = agent;
    next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
