const REVIEW_STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
});

const REVIEW_ELIGIBILITY_MODES = Object.freeze({
  LOGGED_IN: "logged_in",
  VERIFIED_PURCHASE: "verified_purchase"
});

const REVIEW_MODERATION_MODES = Object.freeze({
  AUTO: "auto",
  GATED: "gated"
});

function cloneDefaultReviewStore() {
  return { reviews: [] };
}

function sanitizeReview(review) {
  return { ...review };
}

// Same shape for both the admin table and the public product listing —
// the public list endpoint filters to approved-only and drops
// moderation-internal fields (rejectionReason, moderatedBy) before this
// is ever called, so no separate "public" shaping function is needed.
function toPublicReview(review) {
  return {
    id: review.id,
    productId: review.productId,
    customerName: review.customerName,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    createdAt: review.createdAt
  };
}

module.exports = {
  REVIEW_STATUSES,
  REVIEW_ELIGIBILITY_MODES,
  REVIEW_MODERATION_MODES,
  cloneDefaultReviewStore,
  sanitizeReview,
  toPublicReview
};
