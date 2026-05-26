const { z } = require("zod");
const { HttpError } = require("../../common/http-error");

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date in YYYY-MM-DD format");

const listInvoicesQuerySchema = z.object({
  orderId: z.string().trim().max(160).optional().default(""),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100)
});

const generateInvoicePayloadSchema = z.object({
  invoiceDate: isoDateSchema.optional()
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListInvoicesQuery(query) {
  return listInvoicesQuerySchema.parse(query || {});
}

function parseGenerateInvoicePayload(payload) {
  ensureObject(payload || {}, "Generate invoice");
  return generateInvoicePayloadSchema.parse(payload || {});
}

module.exports = {
  parseListInvoicesQuery,
  parseGenerateInvoicePayload
};
