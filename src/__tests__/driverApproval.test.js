const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  DRIVER_ACCOUNT_STATUS,
  normalizeDriverStatus,
  getDriverApprovalGate
} = require("../utils/driverApproval");

test("normalizeDriverStatus defaults legacy drivers to approved", () => {
  assert.equal(normalizeDriverStatus(undefined), DRIVER_ACCOUNT_STATUS.APPROVED);
  assert.equal(normalizeDriverStatus("pending"), DRIVER_ACCOUNT_STATUS.PENDING);
  assert.equal(normalizeDriverStatus("rejected"), DRIVER_ACCOUNT_STATUS.REJECTED);
  assert.equal(normalizeDriverStatus("blocked"), DRIVER_ACCOUNT_STATUS.BLOCKED);
});

test("getDriverApprovalGate blocks pending drivers", () => {
  const gate = getDriverApprovalGate({ status: DRIVER_ACCOUNT_STATUS.PENDING });
  assert.equal(gate.allowed, false);
  assert.equal(gate.code, "ACCOUNT_PENDING_APPROVAL");
});

test("getDriverApprovalGate exposes rejection reason", () => {
  const gate = getDriverApprovalGate({
    status: DRIVER_ACCOUNT_STATUS.REJECTED,
    rejectionReason: "Incomplete vehicle registration proof"
  });
  assert.equal(gate.allowed, false);
  assert.equal(gate.code, "ACCOUNT_REJECTED");
  assert.equal(gate.message, "Incomplete vehicle registration proof");
});
