const { test } = require("node:test");
const assert = require("node:assert");

const { normalizePlanPayload } = require("../services/subscriptionPlan.service");

const mockMenu = {
  name: "Paneer Bowl",
  price: 120,
  discountPrice: 99,
  isVeg: true
};

test("normalizePlanPayload defaults title and pricing from menu", () => {
  const result = normalizePlanPayload(
    { menuItemId: "507f1f77bcf86cd799439011", durationInDays: 30 },
    mockMenu,
    { isCreate: true }
  );
  assert.strictEqual(result.title, "Paneer Bowl Plan");
  assert.strictEqual(result.pricePerMeal, 99);
  assert.strictEqual(result.totalPrice, 99 * 30);
  assert.strictEqual(result.isVeg, true);
});

test("normalizePlanPayload BOTH sets meal types", () => {
  const result = normalizePlanPayload(
    {
      menuItemId: "507f1f77bcf86cd799439011",
      durationInDays: 7,
      mealType: "BOTH",
      pricePerMeal: 100
    },
    mockMenu,
    { isCreate: true }
  );
  assert.deepStrictEqual(result.mealTypes, ["LUNCH", "DINNER"]);
  assert.strictEqual(result.mealType, "BOTH");
});

test("normalizePlanPayload clamps duration", () => {
  const result = normalizePlanPayload(
    { menuItemId: "507f1f77bcf86cd799439011", durationInDays: 3, pricePerMeal: 50 },
    mockMenu,
    { isCreate: true }
  );
  assert.strictEqual(result.durationInDays, 7);
});
