const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { booleanQueryParam } = require("../../common/zod-helpers");

const listHsnQuerySchema = z.object({
  includeInactive: booleanQueryParam(true),
  q: z.string().trim().max(120).optional().default("")
});

const hsnRateSchema = z.coerce.number().min(0).max(100);

const createHsnSchema = z.object({
  hsnCode: z.string().trim().min(4).max(20),
  description: z.string().trim().min(2).max(500),
  gstRate: hsnRateSchema,
  cgstRate: hsnRateSchema.optional(),
  sgstRate: hsnRateSchema.optional(),
  igstRate: hsnRateSchema.optional(),
  effectiveFrom: z.string().trim().min(8).max(40),
  isActive: z.boolean().optional().default(true)
});

const updateHsnSchema = z.object({
  description: z.string().trim().min(2).max(500).optional(),
  gstRate: hsnRateSchema.optional(),
  cgstRate: hsnRateSchema.optional(),
  sgstRate: hsnRateSchema.optional(),
  igstRate: hsnRateSchema.optional(),
  effectiveFrom: z.string().trim().min(8).max(40).optional(),
  isActive: z.boolean().optional()
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListHsnQuery(query) {
  return listHsnQuerySchema.parse(query || {});
}

function parseCreateHsnPayload(payload) {
  ensureObject(payload, "Create HSN");
  return createHsnSchema.parse(payload);
}

function parseUpdateHsnPayload(payload) {
  ensureObject(payload, "Update HSN");
  return updateHsnSchema.parse(payload);
}

module.exports = {
  parseListHsnQuery,
  parseCreateHsnPayload,
  parseUpdateHsnPayload
};
