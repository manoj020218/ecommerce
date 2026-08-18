const PRINT_JOB_STATUSES = Object.freeze({
  NEEDS_REVIEW: "needs_review",
  APPROVED: "approved",
  REJECTED: "rejected"
});

function jobKey(orderId, lineId) {
  return `${orderId}:${lineId}`;
}

module.exports = { PRINT_JOB_STATUSES, jobKey };
