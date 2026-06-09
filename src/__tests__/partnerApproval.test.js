const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  PARTNER_APPROVAL_STATUS,
  normalizeApprovalStatus,
  getApprovalGate
} = require("../utils/partnerApproval");

test("normalizeApprovalStatus defaults legacy partners to approved", () => {
  assert.equal(normalizeApprovalStatus(undefined), PARTNER_APPROVAL_STATUS.APPROVED);
  assert.equal(normalizeApprovalStatus("pending"), PARTNER_APPROVAL_STATUS.PENDING);
  assert.equal(normalizeApprovalStatus("rejected"), PARTNER_APPROVAL_STATUS.REJECTED);
});

test("getApprovalGate blocks pending partners", () => {
  const gate = getApprovalGate({ approvalStatus: PARTNER_APPROVAL_STATUS.PENDING });
  assert.equal(gate.allowed, false);
  assert.equal(gate.code, "ACCOUNT_PENDING_APPROVAL");
  assert.equal(gate.approvalStatus, PARTNER_APPROVAL_STATUS.PENDING);
});

test("getApprovalGate exposes rejection reason", () => {
  const gate = getApprovalGate({
    approvalStatus: PARTNER_APPROVAL_STATUS.REJECTED,
    rejectionReason: "Missing valid FSSAI license"
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.code, "ACCOUNT_REJECTED");
  assert.equal(gate.message, "Missing valid FSSAI license");
});
