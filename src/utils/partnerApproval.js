const PARTNER_APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED"
};

const DEFAULT_LEGACY_APPROVAL_STATUS = PARTNER_APPROVAL_STATUS.APPROVED;

function normalizeApprovalStatus(value) {
  if (!value) return DEFAULT_LEGACY_APPROVAL_STATUS;
  const normalized = String(value).toUpperCase();
  return Object.values(PARTNER_APPROVAL_STATUS).includes(normalized)
    ? normalized
    : DEFAULT_LEGACY_APPROVAL_STATUS;
}

function getApprovalGate(partner) {
  const approvalStatus = normalizeApprovalStatus(partner?.approvalStatus);
  const rejectionReason = String(partner?.rejectionReason || "").trim();

  if (approvalStatus === PARTNER_APPROVAL_STATUS.APPROVED) {
    return {
      allowed: true,
      approvalStatus,
      rejectionReason: ""
    };
  }

  if (approvalStatus === PARTNER_APPROVAL_STATUS.PENDING) {
    return {
      allowed: false,
      approvalStatus,
      rejectionReason: "",
      code: "ACCOUNT_PENDING_APPROVAL",
      message: "Your partner account is pending admin approval."
    };
  }

  return {
    allowed: false,
    approvalStatus: PARTNER_APPROVAL_STATUS.REJECTED,
    rejectionReason,
    code: "ACCOUNT_REJECTED",
    message: rejectionReason || "Your partner registration was not approved."
  };
}

module.exports = {
  PARTNER_APPROVAL_STATUS,
  normalizeApprovalStatus,
  getApprovalGate
};
