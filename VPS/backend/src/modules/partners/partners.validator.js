const { z } = require("zod");
const { HttpError } = require("../../common/http-error");

const createPartnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(24).optional(),
  commissionRatePercent: z.coerce.number().min(0).max(100),
  attributionWindowDays: z.coerce.number().int().min(1).max(90),
  returnUrl: z.string().trim().max(500).optional().default("")
});

const updatePartnerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  code: z.string().trim().min(2).max(24).optional(),
  commissionRatePercent: z.coerce.number().min(0).max(100).optional(),
  attributionWindowDays: z.coerce.number().int().min(1).max(90).optional(),
  returnUrl: z.string().trim().max(500).optional(),
  isActive: z.coerce.boolean().optional()
});

const assignProductsSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).max(2000)
});

const markCommissionPaidSchema = z.object({
  note: z.string().trim().max(500).optional().default("")
});

const listCommissionsQuerySchema = z.object({
  status: z.enum(["pending", "paid"]).optional()
});

const partnerFeedQuerySchema = z.object({
  key: z.string().trim().min(1)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseCreatePartnerPayload(payload) {
  ensureObject(payload, "Create partner");
  return createPartnerSchema.parse(payload);
}

function parseUpdatePartnerPayload(payload) {
  ensureObject(payload, "Update partner");
  return updatePartnerSchema.parse(payload);
}

function parseAssignProductsPayload(payload) {
  ensureObject(payload, "Assign products");
  return assignProductsSchema.parse(payload);
}

function parseMarkCommissionPaidPayload(payload) {
  ensureObject(payload, "Mark commission paid");
  return markCommissionPaidSchema.parse(payload);
}

function parseListCommissionsQuery(query) {
  return listCommissionsQuerySchema.parse(query || {});
}

function parsePartnerFeedQuery(query) {
  return partnerFeedQuerySchema.parse(query || {});
}

module.exports = {
  parseCreatePartnerPayload,
  parseUpdatePartnerPayload,
  parseAssignProductsPayload,
  parseMarkCommissionPaidPayload,
  parseListCommissionsQuery,
  parsePartnerFeedQuery
};
