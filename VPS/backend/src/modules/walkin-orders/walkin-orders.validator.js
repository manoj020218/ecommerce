const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { CUSTOMER_TYPES } = require("../customers/customers.model");
const {
  WALKIN_PRICE_MODES,
  WALKIN_PAYMENT_METHODS,
  WALKIN_ORDER_STATUSES,
  WALKIN_ALLOWED_SHIPPING_METHODS
} = require("./walkin-orders.model");

const positiveMoneySchema = z.coerce.number().min(0).max(100000000);

const listWalkInOrdersQuerySchema = z.object({
  q: z.string().trim().max(160).optional().default(""),
  status: z.enum(Object.values(WALKIN_ORDER_STATUSES)).optional(),
  paymentStatus: z.enum(["pending", "paid"]).optional(),
  paymentMethod: z.enum(Object.values(WALKIN_PAYMENT_METHODS)).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

const searchCustomersQuerySchema = z.object({
  q: z.string().trim().max(160).optional().default(""),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10)
});

const searchProductsQuerySchema = z.object({
  q: z.string().trim().max(160).optional().default(""),
  categoryId: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(12)
});

const customerPayloadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(150).optional().or(z.literal("")).default(""),
  mobile: z.string().trim().min(8).max(20),
  companyName: z.string().trim().max(160).optional().default(""),
  gstin: z.string().trim().max(20).optional().default(""),
  addressLine1: z.string().trim().max(240).optional().default(""),
  addressLine2: z.string().trim().max(240).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().max(120).optional().default(""),
  stateCode: z.string().trim().max(10).optional().default(""),
  pincode: z.string().trim().max(12).optional().default(""),
  country: z.string().trim().max(80).optional().default("India"),
  customerType: z.enum(CUSTOMER_TYPES).optional().default("retail"),
  priceGroup: z.string().trim().max(120).optional().default(""),
  creditAllowed: z.boolean().optional().default(false)
});

const createWalkInLineSchema = z
  .object({
    productId: z.string().trim().min(2).max(160),
    qty: z.coerce.number().int().min(1).max(100000),
    priceMode: z.enum(Object.values(WALKIN_PRICE_MODES)).optional().default("retail"),
    customUnitPrice: positiveMoneySchema.optional().nullable().default(null)
  })
  .superRefine((value, ctx) => {
    if (value.priceMode === WALKIN_PRICE_MODES.CUSTOM && value.customUnitPrice === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customUnitPrice"],
        message: "customUnitPrice is required for custom price mode."
      });
    }
  });

const createWalkInOrderSchema = z.object({
  customerId: z.string().trim().max(160).optional(),
  customer: customerPayloadSchema,
  items: z.array(createWalkInLineSchema).min(1).max(100),
  shippingMethod: z
    .enum(WALKIN_ALLOWED_SHIPPING_METHODS)
    .optional()
    .default("self_pickup"),
  shippingCharge: positiveMoneySchema.optional().default(0),
  paymentMethod: z.enum(Object.values(WALKIN_PAYMENT_METHODS)),
  markAsPaid: z.boolean().optional().default(false),
  generateInvoice: z.boolean().optional().default(true),
  paymentReference: z.string().trim().max(200).optional().default(""),
  orderNote: z.string().trim().max(1000).optional().default("")
});

const confirmPaymentPayloadSchema = z.object({
  paymentReference: z.string().trim().max(200).optional().default(""),
  generateInvoice: z.boolean().optional().default(true)
});

const generateInvoicePayloadSchema = z.object({
  invoiceDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const updateWalkInOrderStatusSchema = z.object({
  orderStatus: z.enum([
    WALKIN_ORDER_STATUSES.READY_FOR_PICKUP,
    WALKIN_ORDER_STATUSES.DISPATCHED,
    WALKIN_ORDER_STATUSES.COMPLETED,
    WALKIN_ORDER_STATUSES.CANCELLED
  ]),
  adminNote: z.string().trim().max(600).optional().default("")
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListWalkInOrdersQuery(query) {
  return listWalkInOrdersQuerySchema.parse(query || {});
}

function parseSearchCustomersQuery(query) {
  return searchCustomersQuerySchema.parse(query || {});
}

function parseSearchProductsQuery(query) {
  return searchProductsQuerySchema.parse(query || {});
}

function parseCreateWalkInOrderPayload(payload) {
  ensureObject(payload, "Create walk-in order");
  return createWalkInOrderSchema.parse(payload);
}

function parseConfirmPaymentPayload(payload) {
  ensureObject(payload, "Confirm walk-in payment");
  return confirmPaymentPayloadSchema.parse(payload);
}

function parseGenerateInvoicePayload(payload) {
  ensureObject(payload, "Generate walk-in invoice");
  return generateInvoicePayloadSchema.parse(payload);
}

function parseUpdateWalkInOrderStatusPayload(payload) {
  ensureObject(payload, "Update walk-in order status");
  return updateWalkInOrderStatusSchema.parse(payload);
}

module.exports = {
  parseListWalkInOrdersQuery,
  parseSearchCustomersQuery,
  parseSearchProductsQuery,
  parseCreateWalkInOrderPayload,
  parseConfirmPaymentPayload,
  parseGenerateInvoicePayload,
  parseUpdateWalkInOrderStatusPayload
};
