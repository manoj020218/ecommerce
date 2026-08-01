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

// Deliberately excludes state/stateCode/country — those determine Place of
// Supply and the CGST+SGST-vs-IGST split already charged on this invoice.
// Correcting a name/GSTIN typo is safe after issuance; changing the buyer's
// state after tax has been charged is not (needs a credit note instead).
const correctInvoiceBuyerPayloadSchema = z
  .object({
    companyName: z.string().trim().max(200).optional(),
    name: z.string().trim().max(200).optional(),
    gstin: z.string().trim().max(20).optional(),
    email: z.string().trim().max(200).optional(),
    mobile: z.string().trim().max(30).optional(),
    addressLine1: z.string().trim().max(300).optional(),
    addressLine2: z.string().trim().max(300).optional(),
    city: z.string().trim().max(120).optional(),
    pincode: z.string().trim().max(12).optional(),
    reason: z.string().trim().max(400).optional().default("")
  })
  .strict()
  .refine((patch) => Object.keys(patch).some((k) => k !== "reason"), {
    message: "At least one buyer field must be provided."
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

function parseCorrectInvoiceBuyerPayload(payload) {
  ensureObject(payload || {}, "Correct invoice buyer details");
  return correctInvoiceBuyerPayloadSchema.parse(payload || {});
}

module.exports = {
  parseListInvoicesQuery,
  parseGenerateInvoicePayload,
  parseCorrectInvoiceBuyerPayload
};
