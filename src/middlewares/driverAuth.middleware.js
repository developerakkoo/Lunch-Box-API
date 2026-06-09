const jwt = require("jsonwebtoken");
const DeliveryAgent = require("../module/Delivery_Agent");
const { getDriverApprovalGate } = require("../utils/driverApproval");

module.exports = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const agent = await DeliveryAgent.findById(decoded.id).select(
      "-password"
    );

    if (!agent) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (agent.deletedAt) {
      return res.status(403).json({
        message: "This account is no longer active.",
        code: "ACCOUNT_DELETED"
      });
    }

    const approvalGate = getDriverApprovalGate(agent);
    if (!approvalGate.allowed) {
      return res.status(403).json({
        message: approvalGate.message,
        code: approvalGate.code,
        status: approvalGate.status,
        rejectionReason: approvalGate.rejectionReason || undefined
      });
    }

    req.driver = decoded;
    req.deliveryAgent = agent;

    next();

  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};
