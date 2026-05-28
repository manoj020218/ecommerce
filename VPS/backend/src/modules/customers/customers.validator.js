const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const {
  CUSTOMER_TYPES,
  ORDER_MODES,
  B2B_ORDER_STATUSES
} = require("./customers.model");
const { PAYMENT_METHODS } = require("../cart-checkout/cart-checkout.model");

const customerTypeSchema = z.enum(CUSTOMER_TYPES);

const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(160).optional().default(""),
  customerType: z.union([customerTypeSchema, z.literal("")]).optional().default(""),
  approvalStatus: z
    .enum(["", "approved", "not_approved"])
    .optional()
    .default(""),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100)
});

const updateCustomerPayloadSchema = z.object({
  customerType: customerTypeSchema.optional(),
  priceGroup: z.string().trim().max(120).optional(),
  isB2BApproved: z.boolean().optional(),
  gstin: z.string().trim().max(25).optional(),
  companyName: z.string().trim().max(180).optional(),
  creditAllowed: z.boolean().optional(),
  bankTransferOnly: z.boolean().optional(),
  pickupAllowed: z.boolean().optional(),
  orderMode: z
    .enum([ORDER_MODES.ONLINE, ORDER_MODES.OFFLINE_REQUEST, ORDER_MODES.HYBRID])
    .optional()
});

const listOrderRequestsQuerySchema = z.object({
  customerId: z.string().trim().max(160).optional().default(""),
  status: z.string().trim().max(80).optional().default(""),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100)
});

const approveOrderRequestPayloadSchema = z.object({
  paymentMethod: z
    .enum([PAYMENT_METHODS.DIRECT_BANK_TRANSFER, PAYMENT_METHODS.MANUAL_UPI])
    .optional()
    .default(PAYMENT_METHODS.DIRECT_BANK_TRANSFER),
  approvalNote: z.string().trim().max(600).optional().default("")
});

const updateB2BOrderStatusPayloadSchema = z.object({
  orderStatus: z.enum([
    B2B_ORDER_STATUSES.PACKING_STARTED,
    B2B_ORDER_STATUSES.READY_FOR_PICKUP,
    B2B_ORDER_STATUSES.DISPATCHED,
    B2B_ORDER_STATUSES.DELIVERED,
    B2B_ORDER_STATUSES.PICKED_UP,
    B2B_ORDER_STATUSES.COMPLETED,
    B2B_ORDER_STATUSES.CANCELLED
  ]),
  adminNote: z.string().trim().max(600).optional().default("")
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListCustomersQuery(query) {
  return listCustomersQuerySchema.parse(query || {});
}

function parseUpdateCustomerPayload(payload) {
  ensureObject(payload, "Update customer");
  return updateCustomerPayloadSchema.parse(payload);
}

function parseListOrderRequestsQuery(query) {
  return listOrderRequestsQuerySchema.parse(query || {});
}

function parseApproveOrderRequestPayload(payload) {
  ensureObject(payload || {}, "Approve order request");
  return approveOrderRequestPayloadSchema.parse(payload || {});
}

function parseUpdateB2BOrderStatusPayload(payload) {
  ensureObject(payload, "Update B2B order status");
  return updateB2BOrderStatusPayloadSchema.parse(payload);
}

module.exports = {
  parseListCustomersQuery,
  parseUpdateCustomerPayload,
  parseListOrderRequestsQuery,
  parseApproveOrderRequestPayload,
  parseUpdateB2BOrderStatusPayload
};
