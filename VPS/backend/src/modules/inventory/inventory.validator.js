const { z } = require("zod");
const { HttpError } = require("../../common/http-error");

const adjustInventorySchema = z.object({
  deltaQty: z.coerce
    .number()
    .int()
    .min(-1000000)
    .max(1000000)
    .refine((v) => v !== 0, {
      message: "deltaQty cannot be zero."
    }),
  reason: z.string().trim().min(2).max(250),
  note: z.string().trim().max(1000).optional().default("")
});

const updateInventoryPolicySchema = z.object({
  allowBackorder: z.boolean().optional(),
  maxOrderQty: z.coerce.number().int().min(1).max(100000).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(100000).optional(),
  stockStatus: z.enum(["in_stock", "low_stock", "out_of_stock", "backorder"]).optional()
});

const listMovementsQuerySchema = z.object({
  productId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100)
});

const lowStockQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseAdjustInventoryPayload(payload) {
  ensureObject(payload, "Adjust inventory");
  return adjustInventorySchema.parse(payload);
}

function parseUpdateInventoryPolicyPayload(payload) {
  ensureObject(payload, "Inventory policy");
  return updateInventoryPolicySchema.parse(payload);
}

function parseListMovementsQuery(query) {
  return listMovementsQuerySchema.parse(query || {});
}

function parseLowStockQuery(query) {
  return lowStockQuerySchema.parse(query || {});
}

module.exports = {
  parseAdjustInventoryPayload,
  parseUpdateInventoryPolicyPayload,
  parseListMovementsQuery,
  parseLowStockQuery
};
