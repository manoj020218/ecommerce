const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./abandoned-cart.service");
const {
  parseListRecoveriesQuery,
  parseRunRemindersPayload,
  parseRestoreRecoveryPayload,
  parseRecoveryFeedbackPayload
} = require("./abandoned-cart.validator");

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

const adminListRecoveries = asyncHandler(async (req, res) => {
  const query = parseListRecoveriesQuery(req.query || {});
  const data = await service.listRecoveries(query);
  return ok(res, data, "Abandoned cart recoveries fetched.");
});

const adminGetRecoverySummary = asyncHandler(async (_req, res) => {
  const data = await service.getRecoverySummary();
  return ok(res, data, "Abandoned cart summary fetched.");
});

const adminGetRecoveryDetail = asyncHandler(async (req, res) => {
  const data = await service.getRecoveryDetail(req.params.recoveryId);
  return ok(res, data, "Abandoned cart recovery fetched.");
});

const adminRunReminders = asyncHandler(async (req, res) => {
  const payload = parseRunRemindersPayload(req.body || {});
  const data = await service.runReminderDispatch(payload, req.actor);
  return ok(res, data, "Recovery reminders processed.");
});

const publicGetRecoveryPreview = asyncHandler(async (req, res) => {
  const data = await service.getPublicRecoveryPreview(req.params.recoveryToken);
  return ok(res, data, "Recovery preview fetched.");
});

const publicRestoreRecovery = asyncHandler(async (req, res) => {
  const payload = parseRestoreRecoveryPayload(req.body || {});
  const data = await service.restoreRecoveryCart(
    {
      customerId: req.customer?.id || null,
      sessionId: payload.targetSessionId || null
    },
    req.params.recoveryToken,
    payload
  );
  return ok(res, data, "Recovery cart restored.");
});

const publicSaveRecoveryFeedback = asyncHandler(async (req, res) => {
  const payload = parseRecoveryFeedbackPayload(req.body);
  const data = await service.saveRecoveryFeedback(req.params.recoveryToken, payload);
  return ok(res, data, "Recovery feedback saved.");
});

module.exports = {
  adminListRecoveries,
  adminGetRecoverySummary,
  adminGetRecoveryDetail,
  adminRunReminders,
  publicGetRecoveryPreview,
  publicRestoreRecovery,
  publicSaveRecoveryFeedback
};
