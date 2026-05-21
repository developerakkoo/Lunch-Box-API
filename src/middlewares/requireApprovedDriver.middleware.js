/**
 * Use after attachDeliveryAgent. Blocks operational APIs unless status is APPROVED.
 */
module.exports = (req, res, next) => {
  const status = req.deliveryAgent?.status;
  if (status === "APPROVED") {
    return next();
  }
  const map = {
    PENDING: "ACCOUNT_PENDING",
    REJECTED: "ACCOUNT_REJECTED",
    BLOCKED: "ACCOUNT_BLOCKED",
  };
  const code = map[status] || "ACCOUNT_NOT_ALLOWED";
  const messages = {
    PENDING: "Your account is pending approval.",
    REJECTED: "Your registration was not approved.",
    BLOCKED: "This account is blocked.",
  };
  return res.status(403).json({
    message: messages[status] || "Action not allowed for this account.",
    code,
  });
};
