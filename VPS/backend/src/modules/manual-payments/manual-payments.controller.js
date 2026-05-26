const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./manual-payments.service");
const {
  parseSubmitManualPaymentPayload,
  parseListManualPaymentsQuery,
  parseVerifyManualPaymentPayload
} = require("./manual-payments.validator");

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

function paymentContext(req, sessionId = null) {
  return {
    customerId: req.customer?.id || null,
    sessionId: sessionId || null
  };
}

const publicSubmitManualPayment = asyncHandler(async (req, res) => {
  const payload = parseSubmitManualPaymentPayload(req.body);
  if (!req.file || !req.file.path) {
    throw new HttpError(400, "Screenshot upload is required with field name `file`.");
  }

  const data = await service.submitManualPayment(
    paymentContext(req, payload.sessionId),
    payload,
    req.file.path
  );
  return created(res, data, "Manual payment submitted for verification.");
});

const adminListManualPayments = asyncHandler(async (req, res) => {
  const filters = parseListManualPaymentsQuery(req.query || {});
  const data = await service.listManualPaymentSubmissions(filters);
  return ok(res, data, "Manual payments fetched.");
});

const adminVerifyManualPayment = asyncHandler(async (req, res) => {
  const payload = parseVerifyManualPaymentPayload(req.body);
  const data = await service.verifyManualPaymentSubmission(
    req.params.submissionId,
    payload,
    req.actor
  );
  return ok(res, data, "Manual payment verification updated.");
});

module.exports = {
  publicSubmitManualPayment,
  adminListManualPayments,
  adminVerifyManualPayment
};
