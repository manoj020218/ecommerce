const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { INDIA_GST_STATES } = require("../../common/india-gst-states");
const { DEALER_STATUSES, BUSINESS_TYPES } = require("./dealers.model");

const STATE_CODES = INDIA_GST_STATES.map((s) => s.code);
const text = (max) => z.string().trim().max(max);
const mobile = z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,19}$/, "Please enter a valid mobile number");
const optionalMobile = z.union([mobile, z.literal("")]).optional();
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Please enter a valid 15-character GSTIN (or leave it empty)");
const optionalGstin = z.union([gstin, z.literal("")]).optional();
const email = z.union([z.string().trim().toLowerCase().email("Please enter a valid email").max(160), z.literal("")]).optional();

const addressFields = {
  addressLine1: text(300).min(3, "Please enter the firm address"),
  addressLine2: text(300).optional(),
  city: text(120).min(2, "Please enter the city"),
  stateCode: z.string().trim().refine((v) => STATE_CODES.includes(v), "Please select the state"),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Please enter a valid 6-digit PIN code")
};

const registerSchema = z
  .object({
    firmName: text(160).min(2, "Please enter the firm / shop name"),
    contactName: text(120).min(2, "Please enter the contact person's name"),
    mobile,
    alternateMobile: optionalMobile,
    email,
    gstin: optionalGstin,
    businessType: z.union([z.enum(BUSINESS_TYPES), z.literal("")]).optional(),
    ...addressFields,
    promotionsConsent: z.boolean().optional(),
    // honeypot: hidden field real visitors never fill in
    website: z.string().max(0).optional()
  })
  .refine((p) => !p.gstin || p.gstin.slice(0, 2) === p.stateCode, {
    message: "The GSTIN's first two digits don't match the selected state — please check both."
  });

// Admin edit: status / notes plus corrections to the registered details.
const updateSchema = z
  .object({
    status: z.enum(DEALER_STATUSES).optional(),
    notes: text(3000).optional(),
    firmName: text(160).min(2).optional(),
    contactName: text(120).min(2).optional(),
    alternateMobile: optionalMobile,
    gstin: optionalGstin,
    businessType: z.union([z.enum(BUSINESS_TYPES), z.literal("")]).optional(),
    addressLine1: text(300).optional(),
    addressLine2: text(300).optional(),
    city: text(120).optional(),
    pincode: z.union([z.string().trim().regex(/^[1-9][0-9]{5}$/, "Please enter a valid 6-digit PIN code"), z.literal("")]).optional(),
    promotionsConsent: z.boolean().optional()
  })
  .refine((p) => Object.keys(p).length > 0, { message: "Nothing to update." });

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

module.exports = {
  parseRegisterDealer: (p) => { ensureObject(p, "Dealer registration"); return registerSchema.parse(p); },
  parseUpdateDealer: (p) => { ensureObject(p, "Dealer"); return updateSchema.parse(p); }
};
