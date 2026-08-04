const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./reviews.service");
const {
  parseSubmitReviewPayload,
  parseModerateReviewPayload,
  parseListAdminReviewsQuery,
  parseListPublicReviewsQuery
} = require("./reviews.validator");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    return new HttpError(400, "Validation failed.", { issues: error.issues });
  }
  return error;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(mapValidationError(error));
    }
  };
}

const publicListReviews = asyncHandler(async (req, res) => {
  const filters = parseListPublicReviewsQuery(req.query || {});
  const data = await service.listPublicReviewsForProduct(filters.productId, filters);
  return ok(res, data, "Reviews fetched.");
});

const submitReview = asyncHandler(async (req, res) => {
  const payload = parseSubmitReviewPayload(req.body);
  const data = await service.submitReview(req.customer?.id || null, payload);
  return created(res, data, "Review submitted.");
});

const adminListReviews = asyncHandler(async (req, res) => {
  const filters = parseListAdminReviewsQuery(req.query || {});
  const data = await service.listAdminReviews(filters);
  return ok(res, data, "Reviews fetched.");
});

const adminGetReview = asyncHandler(async (req, res) => {
  const data = await service.getAdminReviewById(req.params.reviewId);
  return ok(res, data, "Review fetched.");
});

const adminModerateReview = asyncHandler(async (req, res) => {
  const payload = parseModerateReviewPayload(req.body);
  const data = await service.moderateReview(req.params.reviewId, payload, req.actor);
  return ok(res, data, "Review updated.");
});

const adminDeleteReview = asyncHandler(async (req, res) => {
  const data = await service.deleteReview(req.params.reviewId, req.actor);
  return ok(res, data, "Review deleted.");
});

module.exports = {
  publicListReviews,
  submitReview,
  adminListReviews,
  adminGetReview,
  adminModerateReview,
  adminDeleteReview
};
