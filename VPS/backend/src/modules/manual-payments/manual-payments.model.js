const MANUAL_PAYMENT_STATUSES = Object.freeze({
  PENDING_VERIFICATION: "pending_verification",
  VERIFIED: "verified",
  REJECTED: "rejected"
});

function sanitizeManualPaymentSubmission(submission) {
  return {
    id: submission.id,
    orderId: submission.orderId,
    orderNo: submission.orderNo,
    checkoutSessionId: submission.checkoutSessionId || null,
    paymentMethod: submission.paymentMethod,
    utrNumber: submission.utrNumber,
    screenshotUrl: submission.screenshotUrl || "",
    note: submission.note || "",
    status: submission.status,
    submittedAt: submission.submittedAt,
    submittedBy: submission.submittedBy || null,
    verifiedAt: submission.verifiedAt || null,
    verifiedBy: submission.verifiedBy || null,
    verificationNote: submission.verificationNote || "",
    rejectionReason: submission.rejectionReason || ""
  };
}

module.exports = {
  MANUAL_PAYMENT_STATUSES,
  sanitizeManualPaymentSubmission
};
