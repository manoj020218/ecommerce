const { z } = require("zod");

const listOrdersQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  channel: z
    .union([z.enum(["storefront", "walk_in", "b2b_request"]), z.literal("")])
    .optional()
    .default(""),
  status: z.string().trim().max(80).optional().default(""),
  paymentStatus: z.string().trim().max(80).optional().default(""),
  shipmentStatus: z.string().trim().max(80).optional().default(""),
  paymentMethod: z.string().trim().max(80).optional().default(""),
  customerType: z.string().trim().max(80).optional().default(""),
  invoiceStatus: z
    .union([z.enum(["generated", "pending"]), z.literal("")])
    .optional()
    .default(""),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(200)
});

const fulfillmentItemSchema = z.object({
  srNo: z.coerce.number().int().min(1).optional(),
  productId: z.string().trim().max(120).optional().default(""),
  title: z.string().trim().max(300).optional().default(""),
  fulfillQty: z.coerce.number().int().min(0).optional().default(0)
});

const updateOrderSchema = z.object({
  orderStatus: z.enum(["processing", "cancelled", "fulfilled"]).optional(),
  manualPaymentStatus: z.enum(["verified", "failed", "pending"]).optional(),
  adminNote: z.string().trim().max(2000).optional(),
  customerNote: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().max(60)).max(20).optional(),
  fulfillmentItems: z.array(fulfillmentItemSchema).max(100).optional()
}).strict();

function parseListOrdersQuery(query) {
  return listOrdersQuerySchema.parse(query || {});
}

function parseUpdateOrderPayload(body) {
  return updateOrderSchema.parse(body || {});
}

module.exports = { parseListOrdersQuery, parseUpdateOrderPayload };
