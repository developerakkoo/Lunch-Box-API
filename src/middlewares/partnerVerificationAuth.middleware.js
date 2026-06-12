const jwt = require("jsonwebtoken");
const Partner = require("../module/partner.model");

/**
 * Auth for verification-only routes (status + document resubmit).
 * Accepts any valid partner token (FULL or VERIFICATION scope) and does NOT
 * apply the approval gate, so PENDING/REJECTED partners can use these routes.
 */
module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
    const partner = await Partner.findById(decoded.id).select(
      "approvalStatus rejectionReason status isActive kitchenName ownerName email phone documents reviewedAt"
    );

    if (!partner) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.partner = decoded;
    req.partnerAccount = partner;

    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
