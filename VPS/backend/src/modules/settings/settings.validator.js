const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { resolveSectionKey } = require("./settings.model");

const optionalString = (max = 500) =>
  z.string().trim().max(max, `Must be ${max} characters or less`).optional();

const storeProfileSchema = z.object({
  storeName: optionalString(120),
  legalBusinessName: optionalString(200),
  gstin: optionalString(25),
  address: optionalString(500),
  state: optionalString(80),
  stateCode: optionalString(10),
  supportEmail: optionalString(150),
  supportMobile: optionalString(20),
  whatsappNumber: optionalString(20),
  bankName: optionalString(120),
  accountHolderName: optionalString(120),
  accountNumber: optionalString(40),
  ifsc: optionalString(20),
  upiId: optionalString(120),
  businessHours: optionalString(250),
  pickupAddress: optionalString(500)
});

const brandingSchema = z.object({
  faviconUrl: optionalString(500),
  brandLogoUrl: optionalString(500),
  adminLogoUrl: optionalString(500),
  invoiceLogoUrl: optionalString(500),
  emailLogoUrl: optionalString(500),
  pwaAppIconUrl: optionalString(500),
  splashScreenLogoUrl: optionalString(500),
  themeColor: optionalString(20),
  buttonColor: optionalString(20)
});

const seoDefaultsSchema = z.object({
  homeMetaTitle: optionalString(160),
  homeMetaDescription: optionalString(320),
  defaultOgImageUrl: optionalString(500),
  canonicalDomain: optionalString(300),
  robotsTxt: optionalString(5000),
  sitemapEnabled: z.boolean().optional(),
  searchConsoleVerification: optionalString(300),
  bingVerification: optionalString(300)
});

const reviewSettingsSchema = z.object({
  eligibility: z.enum(["logged_in", "verified_purchase"]).optional(),
  moderationMode: z.enum(["auto", "gated"]).optional()
});

const contactInformationSchema = z.object({
  publicPhone: optionalString(20),
  publicEmail: optionalString(150),
  publicWhatsApp: optionalString(20),
  publicAddress: optionalString(500),
  googleMapLink: optionalString(500),
  supportTiming: optionalString(250),
  socialLinks: z
    .object({
      facebook: optionalString(500),
      instagram: optionalString(500),
      linkedin: optionalString(500),
      youtube: optionalString(500),
      x: optionalString(500)
    })
    .optional()
});

const customCodeTagsSchema = z.object({
  customHeadHtml: optionalString(50000),
  customBodyStartHtml: optionalString(50000),
  customBodyEndHtml: optionalString(50000),
  customCss: optionalString(50000),
  customJs: optionalString(50000),
  googleTagManagerId: optionalString(300),
  googleAnalyticsId: optionalString(300),
  facebookPixelId: optionalString(300)
});

const customInvoiceFieldSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(500)
});

const invoiceSettingsSchema = z.object({
  invoicePrefix: optionalString(30),
  invoicePostfix: optionalString(30),
  financialYearFormat: z.enum(["YYYY-YY", "YYYY-YYYY", "YY-YY"]).optional(),
  invoiceStartingNumber: z.coerce.number().int().min(1).max(999999999).optional(),
  invoiceNumberPadding: z.coerce.number().int().min(1).max(12).optional(),
  invoiceLogoUrl: optionalString(500),
  invoiceFooter: optionalString(4000),
  invoiceTerms: optionalString(8000),
  authorizedSignatoryImageUrl: optionalString(500),
  showBankDetails: z.boolean().optional(),
  showHsnSummary: z.boolean().optional(),
  showShippingLine: z.boolean().optional(),
  showDiscountLine: z.boolean().optional(),
  customInvoiceFields: z.array(customInvoiceFieldSchema).max(20).optional()
});

function ensureNonEmptyPayload(payload, sectionName) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${sectionName} payload must be an object.`);
  }

  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, `${sectionName} payload cannot be empty.`);
  }
}

function parseStoreProfilePatch(payload) {
  ensureNonEmptyPayload(payload, "Store profile");
  return storeProfileSchema.parse(payload);
}

function parseBrandingPatch(payload) {
  ensureNonEmptyPayload(payload, "Branding");
  return brandingSchema.parse(payload);
}

function parseSeoDefaultsPatch(payload) {
  ensureNonEmptyPayload(payload, "SEO defaults");
  return seoDefaultsSchema.parse(payload);
}

function parseReviewSettingsPatch(payload) {
  ensureNonEmptyPayload(payload, "Review settings");
  return reviewSettingsSchema.parse(payload);
}

function parseContactInformationPatch(payload) {
  ensureNonEmptyPayload(payload, "Contact information");
  return contactInformationSchema.parse(payload);
}

function parseCustomCodePatch(payload) {
  ensureNonEmptyPayload(payload, "Custom code");
  return customCodeTagsSchema.parse(payload);
}

function parseInvoiceSettingsPatch(payload) {
  ensureNonEmptyPayload(payload, "Invoice settings");
  return invoiceSettingsSchema.parse(payload);
}

function parseAdminSectionParam(section) {
  const resolved = resolveSectionKey(section);
  if (!resolved) {
    throw new HttpError(404, "Settings section not found.");
  }
  return resolved;
}

module.exports = {
  parseStoreProfilePatch,
  parseBrandingPatch,
  parseSeoDefaultsPatch,
  parseReviewSettingsPatch,
  parseContactInformationPatch,
  parseCustomCodePatch,
  parseInvoiceSettingsPatch,
  parseAdminSectionParam
};
