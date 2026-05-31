const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const SubscriptionTransaction = require("../module/subscriptionTransaction.model");

test("SubscriptionTransaction accepts ONLINE paymentMethod", () => {
  const txn = new SubscriptionTransaction({
    userSubscriptionId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    partnerId: new mongoose.Types.ObjectId(),
    type: "PURCHASE",
    amount: 500,
    paymentMethod: "ONLINE",
    paymentStatus: "PAID",
  });
  const err = txn.validateSync();
  assert.equal(err, undefined, err?.message);
});
