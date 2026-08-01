const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { PAYMENT_METHODS } = require("../cart-checkout/cart-checkout.model");
const { MANUAL_PAYMENT_STATUSES } = require("./manual-payments.model");

const submitManualPaymentPayloadSchema = z.object({
  sessionId: z.string().trim().min(3).max(120).optional(),
  orderId: z.string().trim().min(2).max(160),
  paymentMethod: z
    .enum([PAYMENT_METHODS.DIRECT_BANK_TRANSFER, PAYMENT_METHODS.MANUAL_UPI])
    .optional(),
  utrNumber: z.string().trim().min(3).max(160),
  note: z.string().trim().max(600).optional().default("")
});

const listManualPaymentsQuerySchema = z.object({
  status: z
    .enum([
      MANUAL_PAYMENT_STATUSES.PENDING_VERIFICATION,
      MANUAL_PAYMENT_STATUSES.VERIFIED,
      MANUAL_PAYMENT_STATUSES.REJECTED
    ])
    .optional(),
  orderId: z.string().trim().max(140).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100)
});

const verifyManualPaymentPayloadSchema = z.object({
  action: z.enum(["approve", "reject"]),
  gatewayTxnId: z.string().trim().max(200).optional().default(""),
  verificationNote: z.string().trim().max(600).optional().default(""),
  rejectionReason: z.string().trim().max(600).optional().default("")
});

const requestWhatsAppReminderPayloadSchema = z.object({
  orderId: z.string().trim().min(2).max(160)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseSubmitManualPaymentPayload(payload) {
  ensureObject(payload, "Submit manual payment");
  return submitManualPaymentPayloadSchema.parse(payload);
}

function parseListManualPaymentsQuery(query) {
  return listManualPaymentsQuerySchema.parse(query || {});
}

function parseVerifyManualPaymentPayload(payload) {
  ensureObject(payload, "Verify manual payment");
  return verifyManualPaymentPayloadSchema.parse(payload);
}

function parseRequestWhatsAppReminderPayload(payload) {
  ensureObject(payload, "Request WhatsApp reminder");
  return requestWhatsAppReminderPayloadSchema.parse(payload);
}

module.exports = {
  parseSubmitManualPaymentPayload,
  parseListManualPaymentsQuery,
  parseVerifyManualPaymentPayload,
  parseRequestWhatsAppReminderPayload
};
