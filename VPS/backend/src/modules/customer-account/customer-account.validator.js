const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { REORDER_MODES } = require("./customer-account.model");

const optionalString = (max = 300) =>
  z.string().trim().max(max, `Must be ${max} characters or less`).optional();

const accountBootstrapQuerySchema = z.object({
  historyLimit: z.coerce.number().int().min(1).max(20).optional().default(6)
});

const listOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  companyName: optionalString(180)
});

const linkGuestOrderSchema = z.object({
  orderId: z.string().trim().min(2).max(180)
});

const reorderOrderSchema = z.object({
  mode: z
    .enum([REORDER_MODES.REPLACE, REORDER_MODES.MERGE])
    .optional()
    .default(REORDER_MODES.REPLACE)
});

const addressSchema = z.object({
  label: optionalString(80),
  name: z.string().trim().min(2).max(120),
  mobile: optionalString(20),
  email: z.string().trim().email().max(150).optional().or(z.literal("")),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: optionalString(200),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  stateCode: z.string().trim().min(2).max(10),
  pincode: z.string().trim().min(4).max(10),
  country: optionalString(80),
  isDefaultBilling: z.boolean().optional(),
  isDefaultShipping: z.boolean().optional()
});

const gstDetailsSchema = z.object({
  gstin: optionalString(25),
  businessName: optionalString(180),
  contactName: optionalString(120)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseAccountBootstrapQuery(query) {
  return accountBootstrapQuerySchema.parse(query || {});
}

function parseListOrdersQuery(query) {
  return listOrdersQuerySchema.parse(query || {});
}

function parseUpdateProfilePayload(payload) {
  ensureObject(payload, "Update profile");
  return updateProfileSchema.parse(payload);
}

function parseLinkGuestOrderPayload(payload) {
  ensureObject(payload, "Link guest order");
  return linkGuestOrderSchema.parse(payload);
}

function parseReorderOrderPayload(payload) {
  ensureObject(payload || {}, "Reorder order");
  return reorderOrderSchema.parse(payload || {});
}

function parseCreateAddressPayload(payload) {
  ensureObject(payload, "Create address");
  return addressSchema.parse(payload);
}

function parseUpdateAddressPayload(payload) {
  ensureObject(payload, "Update address");
  return addressSchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "Address update payload cannot be empty."
  }).parse(payload);
}

function parseGstDetailsPayload(payload) {
  ensureObject(payload, "GST details");
  return gstDetailsSchema.parse(payload);
}

module.exports = {
  parseAccountBootstrapQuery,
  parseListOrdersQuery,
  parseUpdateProfilePayload,
  parseLinkGuestOrderPayload,
  parseReorderOrderPayload,
  parseCreateAddressPayload,
  parseUpdateAddressPayload,
  parseGstDetailsPayload
};
