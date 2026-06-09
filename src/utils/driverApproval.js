const DRIVER_ACCOUNT_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  BLOCKED: "BLOCKED"
};

const DEFAULT_LEGACY_DRIVER_STATUS = DRIVER_ACCOUNT_STATUS.APPROVED;

function normalizeDriverStatus(value) {
  if (!value) return DEFAULT_LEGACY_DRIVER_STATUS;
  const normalized = String(value).toUpperCase();
  return Object.values(DRIVER_ACCOUNT_STATUS).includes(normalized)
    ? normalized
    : DEFAULT_LEGACY_DRIVER_STATUS;
}

function getDriverApprovalGate(driver) {
  const status = normalizeDriverStatus(driver?.status);
  const rejectionReason = String(driver?.rejectionReason || "").trim();

  if (status === DRIVER_ACCOUNT_STATUS.APPROVED) {
    return { allowed: true, status, rejectionReason: "" };
  }

  if (status === DRIVER_ACCOUNT_STATUS.PENDING) {
    return {
      allowed: false,
      status,
      rejectionReason: "",
      code: "ACCOUNT_PENDING_APPROVAL",
      message: "Your driver account is pending admin approval."
    };
  }

  if (status === DRIVER_ACCOUNT_STATUS.REJECTED) {
    return {
      allowed: false,
      status,
      rejectionReason,
      code: "ACCOUNT_REJECTED",
      message: rejectionReason || "Your driver registration was not approved."
    };
  }

  return {
    allowed: false,
    status: DRIVER_ACCOUNT_STATUS.BLOCKED,
    rejectionReason: "",
    code: "ACCOUNT_BLOCKED",
    message: "This account is blocked."
  };
}

module.exports = {
  DRIVER_ACCOUNT_STATUS,
  normalizeDriverStatus,
  getDriverApprovalGate
};
