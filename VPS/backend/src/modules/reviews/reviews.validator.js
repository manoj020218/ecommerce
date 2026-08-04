const { z } = require("zod");
const { HttpError } = require("../../common/http-error");

const submitReviewSchema = z.object({
  productId: z.string().trim().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(2).max(120),
  comment: z.string().trim().min(2).max(2000)
});

const moderateReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().trim().max(500).optional().default("")
});

const listAdminReviewsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  productId: z.string().trim().optional()
});

const listPublicReviewsQuerySchema = z.object({
  productId: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseSubmitReviewPayload(payload) {
  ensureObject(payload, "Submit review");
  return submitReviewSchema.parse(payload);
}

function parseModerateReviewPayload(payload) {
  ensureObject(payload, "Moderate review");
  return moderateReviewSchema.parse(payload);
}

function parseListAdminReviewsQuery(query) {
  return listAdminReviewsQuerySchema.parse(query || {});
}

function parseListPublicReviewsQuery(query) {
  return listPublicReviewsQuerySchema.parse(query || {});
}

module.exports = {
  parseSubmitReviewPayload,
  parseModerateReviewPayload,
  parseListAdminReviewsQuery,
  parseListPublicReviewsQuery
};
