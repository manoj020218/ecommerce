const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { booleanQueryParam } = require("../../common/zod-helpers");
const { SHARE_CLAIM_MODES } = require("../cart-checkout/cart-checkout.model");
const {
  RECOVERY_FEEDBACK_REASONS,
  RECOVERY_STAGES
} = require("./abandoned-cart.model");

const optionalString = (max = 300) =>
  z.string().trim().max(max, `Must be ${max} characters or less`).optional();

const sessionIdSchema = z.string().trim().min(3).max(120);

const listRecoveriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  stage: z
    .enum(Object.values(RECOVERY_STAGES))
    .optional(),
  dueOnly: booleanQueryParam(false),
  customerId: optionalString(80)
});

const runRemindersPayloadSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  nowIso: optionalString(60)
});

const restoreRecoveryPayloadSchema = z.object({
  targetSessionId: sessionIdSchema.optional(),
  mode: z
    .enum([SHARE_CLAIM_MODES.MERGE, SHARE_CLAIM_MODES.REPLACE])
    .optional()
    .default(SHARE_CLAIM_MODES.REPLACE)
});

const feedbackPayloadSchema = z.object({
  reason: z.enum(RECOVERY_FEEDBACK_REASONS),
  note: optionalString(300)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListRecoveriesQuery(query) {
  return listRecoveriesQuerySchema.parse(query || {});
}

function parseRunRemindersPayload(payload) {
  ensureObject(payload || {}, "Run reminders");
  return runRemindersPayloadSchema.parse(payload || {});
}

function parseRestoreRecoveryPayload(payload) {
  ensureObject(payload || {}, "Restore recovery");
  return restoreRecoveryPayloadSchema.parse(payload || {});
}

function parseRecoveryFeedbackPayload(payload) {
  ensureObject(payload, "Recovery feedback");
  return feedbackPayloadSchema.parse(payload);
}

module.exports = {
  parseListRecoveriesQuery,
  parseRunRemindersPayload,
  parseRestoreRecoveryPayload,
  parseRecoveryFeedbackPayload
};
