/**
 * Use after attachDeliveryAgent. Blocks operational APIs unless status is APPROVED.
 */
const { getDriverApprovalGate } = require("../utils/driverApproval");

module.exports = (req, res, next) => {
  const gate = getDriverApprovalGate(req.deliveryAgent);
  if (gate.allowed) {
    return next();
  }
  const map = {
    PENDING: "ACCOUNT_PENDING",
    REJECTED: "ACCOUNT_REJECTED",
    BLOCKED: "ACCOUNT_BLOCKED",
  };
  const code = gate.code || map[gate.status] || "ACCOUNT_NOT_ALLOWED";
  const messages = {
    PENDING: "Your account is pending approval.",
    REJECTED: "Your registration was not approved.",
    BLOCKED: "This account is blocked.",
  };
  return res.status(403).json({
    message: gate.message || messages[gate.status] || "Action not allowed for this account.",
    code,
  });
};
