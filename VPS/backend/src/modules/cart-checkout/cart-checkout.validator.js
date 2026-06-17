const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const {
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  SHARE_CLAIM_MODES
} = require("./cart-checkout.model");

const sessionIdSchema = z.string().trim().min(3).max(120);
const productIdSchema = z.string().trim().min(2).max(120);

const getCartQuerySchema = z.object({
  sessionId: sessionIdSchema.optional(),
  shippingPincode: z.string().trim().max(10).optional().default(""),
  shippingStateCode: z.string().trim().max(10).optional().default(""),
  shippingState: z.string().trim().max(80).optional().default(""),
  paymentMethod: z
    .enum([
      PAYMENT_METHODS.ONLINE,
      PAYMENT_METHODS.DIRECT_BANK_TRANSFER,
      PAYMENT_METHODS.MANUAL_UPI
    ])
    .optional()
    .default(PAYMENT_METHODS.ONLINE),
  shippingMethod: z
    .enum([
      SHIPPING_METHODS.STANDARD,
      SHIPPING_METHODS.EXPRESS,
      SHIPPING_METHODS.LOCAL_PICKUP,
      SHIPPING_METHODS.SELF_PICKUP,
      SHIPPING_METHODS.TRANSPORT,
      SHIPPING_METHODS.MANUAL_DELIVERY
    ])
    .optional()
    .default(SHIPPING_METHODS.STANDARD)
});

const addItemSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  productId: productIdSchema,
  qty: z.coerce.number().int().min(1).max(100000)
});

const updateItemSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  qty: z.coerce.number().int().min(1).max(100000)
});

const deleteItemQuerySchema = z.object({
  sessionId: sessionIdSchema.optional()
});

const mergeGuestSchema = z.object({
  guestSessionId: sessionIdSchema
});

const shareCartSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  expiresInMinutes: z.coerce.number().int().min(5).max(10080).optional().default(1440)
});

const claimSharedCartSchema = z.object({
  targetSessionId: sessionIdSchema.optional(),
  mode: z
    .enum([SHARE_CLAIM_MODES.MERGE, SHARE_CLAIM_MODES.REPLACE])
    .optional()
    .default(SHARE_CLAIM_MODES.MERGE)
});

const checkoutStartSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  paymentMethod: z
    .enum([
      PAYMENT_METHODS.ONLINE,
      PAYMENT_METHODS.DIRECT_BANK_TRANSFER,
      PAYMENT_METHODS.MANUAL_UPI
    ])
    .optional()
    .default(PAYMENT_METHODS.ONLINE),
  shippingMethod: z
    .enum([
      SHIPPING_METHODS.STANDARD,
      SHIPPING_METHODS.EXPRESS,
      SHIPPING_METHODS.LOCAL_PICKUP,
      SHIPPING_METHODS.SELF_PICKUP,
      SHIPPING_METHODS.TRANSPORT,
      SHIPPING_METHODS.MANUAL_DELIVERY
    ])
    .optional()
    .default(SHIPPING_METHODS.STANDARD),
  billingAddress: z.record(z.any()).optional().default({}),
  shippingAddress: z.record(z.any()).optional().default({})
});

const checkoutViewQuerySchema = z.object({
  sessionId: sessionIdSchema.optional()
});

const createPaymentAttemptSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  checkoutSessionId: z.string().trim().min(2).max(140),
  gateway: z.string().trim().min(2).max(120).optional()
});

const paymentWebhookSchema = z.object({
  attemptId: z.string().trim().min(2).max(140),
  status: z.enum(["success", "failed"]),
  eventId: z.string().trim().max(200).optional().default(""),
  gatewayTxnId: z.string().trim().max(200).optional().default(""),
  failureReason: z.string().trim().max(300).optional().default("")
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseGetCartQuery(query) {
  return getCartQuerySchema.parse(query || {});
}

function parseAddItemPayload(payload) {
  ensureObject(payload, "Add cart item");
  return addItemSchema.parse(payload);
}

function parseUpdateItemPayload(payload) {
  ensureObject(payload, "Update cart item");
  return updateItemSchema.parse(payload);
}

function parseDeleteItemQuery(query) {
  return deleteItemQuerySchema.parse(query || {});
}

function parseMergeGuestPayload(payload) {
  ensureObject(payload, "Merge guest cart");
  return mergeGuestSchema.parse(payload);
}

function parseShareCartPayload(payload) {
  ensureObject(payload, "Share cart");
  return shareCartSchema.parse(payload);
}

function parseClaimSharedCartPayload(payload) {
  ensureObject(payload, "Claim shared cart");
  return claimSharedCartSchema.parse(payload);
}

function parseCheckoutStartPayload(payload) {
  ensureObject(payload, "Checkout start");
  return checkoutStartSchema.parse(payload);
}

function parseCheckoutViewQuery(query) {
  return checkoutViewQuerySchema.parse(query || {});
}

function parseCreatePaymentAttemptPayload(payload) {
  ensureObject(payload, "Create payment attempt");
  return createPaymentAttemptSchema.parse(payload);
}

function parsePaymentWebhookPayload(payload) {
  ensureObject(payload, "Payment webhook");
  return paymentWebhookSchema.parse(payload);
}

module.exports = {
  parseGetCartQuery,
  parseAddItemPayload,
  parseUpdateItemPayload,
  parseDeleteItemQuery,
  parseMergeGuestPayload,
  parseShareCartPayload,
  parseClaimSharedCartPayload,
  parseCheckoutStartPayload,
  parseCheckoutViewQuery,
  parseCreatePaymentAttemptPayload,
  parsePaymentWebhookPayload
};
