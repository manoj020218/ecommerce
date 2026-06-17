const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const {
  SETUP_WIZARD_STEP_KEYS
} = require("./setup-wizard.model");

const optionalString = (max = 300) =>
  z.string().trim().max(max).optional().default("");

const stepSchemas = {
  business_profile: z.object({
    storeName: optionalString(120),
    legalBusinessName: optionalString(200),
    supportEmail: optionalString(150),
    supportMobile: optionalString(30),
    whatsappNumber: optionalString(30),
    address: optionalString(500),
    pickupAddress: optionalString(500),
    state: optionalString(120),
    stateCode: optionalString(10),
    storefrontDomain: optionalString(240),
    adminDomain: optionalString(240),
    apiDomain: optionalString(240)
  }),
  logo_theme: z.object({
    themeColor: optionalString(20),
    buttonColor: optionalString(20)
  }),
  gst_profile: z.object({
    gstin: optionalString(25),
    state: optionalString(120),
    stateCode: optionalString(10)
  }),
  invoice_settings: z.object({
    invoicePrefix: optionalString(30),
    invoicePostfix: optionalString(30),
    invoiceStartingNumber: z.coerce.number().int().min(1).max(999999999).optional(),
    invoiceNumberPadding: z.coerce.number().int().min(1).max(12).optional(),
    invoiceFooter: optionalString(4000),
    invoiceTerms: optionalString(8000),
    showBankDetails: z.boolean().optional(),
    showHsnSummary: z.boolean().optional(),
    showShippingLine: z.boolean().optional(),
    showDiscountLine: z.boolean().optional()
  }),
  admin_user: z
    .object({
      name: optionalString(120),
      email: optionalString(150),
      mobile: optionalString(30),
      password: optionalString(160),
      confirmPassword: optionalString(160)
    })
    .superRefine((value, ctx) => {
      if (value.password || value.confirmPassword) {
        if (!value.password || value.password.length < 8) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["password"],
            message: "Password must be at least 8 characters."
          });
        }
        if (value.password !== value.confirmPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["confirmPassword"],
            message: "Password confirmation does not match."
          });
        }
      }
    }),
  smtp_email: z.object({
    host: optionalString(200),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    secure: z.boolean().optional(),
    username: optionalString(200),
    fromName: optionalString(200),
    fromEmail: optionalString(200),
    replyToEmail: optionalString(200),
    password: optionalString(200)
  }),
  google_login: z.object({
    enabled: z.boolean().optional(),
    clientId: optionalString(300),
    redirectUri: optionalString(400),
    clientSecret: optionalString(300)
  }),
  phone_otp: z.object({
    enabled: z.boolean().optional(),
    provider: optionalString(120),
    senderId: optionalString(120),
    templateId: optionalString(120),
    apiBaseUrl: optionalString(300),
    authToken: optionalString(300)
  }),
  payment_gateway: z.object({
    providerCode: optionalString(120),
    isEnabled: z.boolean().optional(),
    mode: z.enum(["test", "live"]).optional(),
    keyId: optionalString(200),
    keySecret: optionalString(300),
    webhookSecret: optionalString(300)
  }),
  manual_bank_upi: z.object({
    beneficiaryName: optionalString(200),
    bankName: optionalString(160),
    accountHolderName: optionalString(160),
    accountNumber: optionalString(60),
    ifsc: optionalString(30),
    upiId: optionalString(160),
    instructions: optionalString(1000)
  }),
  shipping_courier: z.object({
    courierName: optionalString(160),
    courierCode: optionalString(40),
    trackingUrlTemplate: optionalString(500),
    trackingPageUrl: optionalString(500),
    supportPhone: optionalString(30),
    supportEmail: optionalString(150),
    apiEnabled: z.boolean().optional(),
    apiProvider: optionalString(120),
    pickupAddress: optionalString(500),
    pickupPincode: optionalString(20)
  }),
  merchant_center: z.object({
    merchantId: optionalString(160),
    claimedDomain: optionalString(240),
    feedUrl: optionalString(400),
    targetCountry: optionalString(10),
    language: optionalString(20)
  }),
  seo_search_console: z.object({
    canonicalDomain: optionalString(240),
    searchConsoleVerification: optionalString(300),
    bingVerification: optionalString(300),
    googleAnalyticsId: optionalString(120),
    googleTagManagerId: optionalString(120)
  }),
  meta_pixel: z.object({
    enabled: z.boolean().optional(),
    pixelId: optionalString(120),
    catalogId: optionalString(120)
  }),
  backup_settings: z.object({
    backupDir: optionalString(300),
    retentionDays: z.coerce.number().int().min(1).max(365).optional(),
    cronExpression: optionalString(120),
    includeUploads: z.boolean().optional(),
    includeEnvFile: z.boolean().optional(),
    runHealthCheckAfterBackup: z.boolean().optional(),
    notifyEmail: optionalString(150)
  }),
  launch_checklist: z.object({
    dnsReady: z.boolean().optional(),
    sslReady: z.boolean().optional(),
    frontServed: z.boolean().optional(),
    adminServed: z.boolean().optional(),
    apiServed: z.boolean().optional(),
    backupVerified: z.boolean().optional(),
    paymentGatewayReviewed: z.boolean().optional(),
    merchantFeedReviewed: z.boolean().optional(),
    searchConsoleSubmitted: z.boolean().optional(),
    firstInvoiceTested: z.boolean().optional()
  })
};

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, `${label} payload cannot be empty.`);
  }
}

function parseStepKey(value) {
  if (!SETUP_WIZARD_STEP_KEYS.includes(value)) {
    throw new HttpError(404, "Setup wizard step not found.");
  }

  return value;
}

function parseSetupWizardStepPayload(stepKey, payload) {
  ensureObject(payload, "Setup wizard step");
  return stepSchemas[stepKey].parse(payload);
}

module.exports = {
  parseStepKey,
  parseSetupWizardStepPayload
};
