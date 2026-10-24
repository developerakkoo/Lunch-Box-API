const { test } = require("node:test");
const assert = require("node:assert");
const { splitAmount } = require("../services/subscriptionCommission.service");
const {
  resolveMealTypesForPlan,
  calendarDayKey,
  isScheduledForToday,
} = require("../services/subscriptionSchedule.service");

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

test("calendar day follows Asia/Kolkata", () => {
  const istMidnight = new Date("2026-10-24T18:30:00.000Z");
  assert.strictEqual(calendarDayKey(istMidnight), "2026-10-25");
  assert.strictEqual(
    isScheduledForToday(istMidnight, new Date("2026-10-25T08:00:00.000Z")),
    true
  );
  assert.strictEqual(
    isScheduledForToday(istMidnight, new Date("2026-10-24T12:00:00.000Z")),
    false
  );
});
