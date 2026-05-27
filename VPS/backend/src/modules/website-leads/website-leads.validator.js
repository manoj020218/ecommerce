const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { WEBSITE_LEAD_STATUSES } = require("./website-leads.model");

const optionalString = (max) => z.string().trim().max(max).optional().default("");

const createWebsiteLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  mobile: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,19}$/),
  email: z.string().trim().email().max(160),
  businessName: z.string().trim().min(2).max(180),
  businessType: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  currentWebsite: optionalString(300),
  monthlyOrders: z.coerce.number().int().min(0).max(1000000).optional().nullable().default(null),
  productCount: z.coerce.number().int().min(0).max(10000000).optional().nullable().default(null),
  message: z.string().trim().min(5).max(2000),
  sourcePage: z.string().trim().min(1).max(500)
});

const listAdminWebsiteLeadsQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.enum(WEBSITE_LEAD_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

const updateWebsiteLeadSchema = z
  .object({
    status: z.enum(WEBSITE_LEAD_STATUSES).optional(),
    notes: z.string().trim().max(3000).optional()
  })
  .refine((payload) => payload.status !== undefined || payload.notes !== undefined, {
    message: "At least one editable field is required."
  });

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseCreateWebsiteLeadPayload(payload) {
  ensureObject(payload, "Website lead");
  return createWebsiteLeadSchema.parse(payload);
}

function parseListAdminWebsiteLeadsQuery(query) {
  return listAdminWebsiteLeadsQuerySchema.parse(query || {});
}

function parseUpdateWebsiteLeadPayload(payload) {
  ensureObject(payload, "Website lead update");
  return updateWebsiteLeadSchema.parse(payload);
}

module.exports = {
  parseCreateWebsiteLeadPayload,
  parseListAdminWebsiteLeadsQuery,
  parseUpdateWebsiteLeadPayload
};
