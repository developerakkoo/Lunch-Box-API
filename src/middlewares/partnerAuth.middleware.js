const jwt = require("jsonwebtoken");
const Partner = require("../module/partner.model");
const { getApprovalGate } = require("../utils/partnerApproval");

module.exports = async (req, res, next) => {

  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
    const partner = await Partner.findById(decoded.id).select(
      "approvalStatus rejectionReason status isActive ownerPartner kitchenName ownerName email phone address latitude longitude"
    );

    if (!partner) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const approvalGate = getApprovalGate(partner);
    if (!approvalGate.allowed) {
      return res.status(403).json({
        message: approvalGate.message,
        code: approvalGate.code,
        approvalStatus: approvalGate.approvalStatus,
        rejectionReason: approvalGate.rejectionReason || undefined
      });
    }

    req.partner = decoded;
    req.partnerAccount = partner;

    next();

  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
