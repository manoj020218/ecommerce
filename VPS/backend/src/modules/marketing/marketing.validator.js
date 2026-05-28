const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { OFFER_TYPES, TEMPLATE_KEYS } = require("./marketing.model");

const isoDateSchema = z.string().datetime({ offset: true });

const offerPayloadSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(OFFER_TYPES),
  description: z.string().trim().max(1000).optional().default(""),
  couponCode: z.string().trim().max(80).optional().default(""),
  percentOff: z.coerce.number().min(0).max(100).optional().nullable().default(null),
  amountOff: z.coerce.number().min(0).max(100000000).optional().nullable().default(null),
  minOrderValue: z.coerce.number().min(0).max(100000000).optional().nullable().default(null),
  customerType: z.string().trim().max(80).optional().default(""),
  productIds: z.array(z.string().trim().min(2).max(160)).max(200).optional().default([]),
  categoryIds: z.array(z.string().trim().min(2).max(160)).max(200).optional().default([]),
  startsAt: isoDateSchema.optional().nullable().default(null),
  endsAt: isoDateSchema.optional().nullable().default(null),
  isActive: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).optional().default("")
});

const offerPatchSchema = offerPayloadSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  { message: "At least one offer field is required." }
);

const templatePatchSchema = z
  .object({
    subject: z.string().trim().min(3).max(300).optional(),
    body: z.string().trim().min(5).max(20000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one template field is required."
  });

const previewPayloadSchema = z.object({
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({})
});

const notificationLogsQuerySchema = z.object({
  templateKey: z.enum(TEMPLATE_KEYS).optional(),
  status: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

const offersQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional().default(true)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseOfferPayload(payload) {
  ensureObject(payload, "Offer");
  return offerPayloadSchema.parse(payload);
}

function parseOfferPatch(payload) {
  ensureObject(payload, "Offer update");
  return offerPatchSchema.parse(payload);
}

function parseTemplatePatch(payload) {
  ensureObject(payload, "Template update");
  return templatePatchSchema.parse(payload);
}

function parsePreviewPayload(payload) {
  ensureObject(payload, "Template preview");
  return previewPayloadSchema.parse(payload);
}

function parseNotificationLogsQuery(query) {
  return notificationLogsQuerySchema.parse(query || {});
}

function parseOffersQuery(query) {
  return offersQuerySchema.parse(query || {});
}

function parseTemplateKey(value) {
  return z.enum(TEMPLATE_KEYS).parse(value);
}

module.exports = {
  parseOfferPayload,
  parseOfferPatch,
  parseTemplatePatch,
  parsePreviewPayload,
  parseNotificationLogsQuery,
  parseOffersQuery,
  parseTemplateKey
};
