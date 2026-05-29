const { test } = require("node:test");
const assert = require("node:assert");
const { splitAmount } = require("../services/subscriptionCommission.service");
const { resolveMealTypesForPlan } = require("../services/subscriptionSchedule.service");

test("splitAmount applies 20% commission on 3000", () => {
  const r = splitAmount(3000, 20);
  assert.strictEqual(r.commissionAmount, 600);
  assert.strictEqual(r.partnerNetAmount, 2400);
});

test("resolveMealTypesForPlan BOTH", () => {
  const types = resolveMealTypesForPlan({ mealType: "BOTH" });
  assert.deepStrictEqual(types, ["LUNCH", "DINNER"]);
});

test("resolveMealTypesForPlan uses mealTypes array", () => {
  const types = resolveMealTypesForPlan({ mealTypes: ["BREAKFAST", "LUNCH"] });
  assert.deepStrictEqual(types, ["BREAKFAST", "LUNCH"]);
});
