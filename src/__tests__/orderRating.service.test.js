const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  RatingError,
  buildRatingSummary,
  presentRatingSummary,
  reviewerFirstName,
  parseStar,
  parseReview
} = require("../services/orderRating.service");

test("buildRatingSummary weights stars and fills empty buckets", () => {
  const summary = buildRatingSummary([
    { _id: 5, count: 2 },
    { _id: 4, count: 1 },
    { _id: 1, count: 1 }
  ]);
  assert.equal(summary.totalReviews, 4);
  assert.equal(summary.averageRating, 3.75);
  assert.deepEqual(summary.distribution, { 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 });
});

test("buildRatingSummary returns zeros when there are no reviews", () => {
  const summary = buildRatingSummary([]);
  assert.equal(summary.averageRating, 0);
  assert.equal(summary.totalReviews, 0);
});

test("presentRatingSummary normalizes missing distribution keys", () => {
  const summary = presentRatingSummary({
    averageRating: 4.2,
    totalReviews: 3,
    distribution: { 5: 2, 4: 1 }
  });
  assert.equal(summary.averageRating, 4.2);
  assert.equal(summary.distribution[5], 2);
  assert.equal(summary.distribution[1], 0);
});

test("reviewerFirstName uses the first word and falls back to Guest", () => {
  assert.equal(reviewerFirstName("Rahul Sharma"), "Rahul");
  assert.equal(reviewerFirstName("  "), "Guest");
  assert.equal(reviewerFirstName(null), "Guest");
});

test("parseStar requires an integer from 1 to 5", () => {
  assert.equal(parseStar(5, { required: true, code: "INVALID_PARTNER_RATING", label: "partnerRating" }), 5);
  assert.equal(parseStar("4", { required: true, code: "INVALID_PARTNER_RATING", label: "partnerRating" }), 4);
  assert.equal(parseStar(undefined, { required: false, code: "INVALID_DELIVERY_RATING", label: "deliveryRating" }), undefined);
  assert.throws(
    () => parseStar(4.5, { required: true, code: "INVALID_PARTNER_RATING", label: "partnerRating" }),
    (error) => error instanceof RatingError && error.status === 400
  );
  assert.throws(
    () => parseStar(undefined, { required: true, code: "INVALID_PARTNER_RATING", label: "partnerRating" }),
    (error) => error instanceof RatingError && error.code === "INVALID_PARTNER_RATING"
  );
});

test("parseReview trims and rejects comments over 500 characters", () => {
  assert.equal(parseReview("  Tasty  "), "Tasty");
  assert.equal(parseReview(undefined), undefined);
  assert.throws(
    () => parseReview("a".repeat(501)),
    (error) => error instanceof RatingError && error.code === "INVALID_REVIEW"
  );
});
