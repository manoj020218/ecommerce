const SETUP_WIZARD_STEPS = Object.freeze([
  {
    key: "business_profile",
    label: "Business Profile",
    description: "Business identity, contacts, and deployment domains.",
    optional: false
  },
  {
    key: "logo_theme",
    label: "Logo / Favicon / Theme",
    description: "Brand assets and theme colors for the storefront and admin.",
    optional: false
  },
  {
    key: "gst_profile",
    label: "GST Profile",
    description: "GSTIN, business state, and place-of-supply defaults.",
    optional: false
  },
  {
    key: "invoice_settings",
    label: "Invoice Settings",
    description: "Invoice numbering, footer, terms, and GST print preferences.",
    optional: false
  },
  {
    key: "admin_user",
    label: "Admin User",
    description: "Primary super admin contact details and password handoff.",
    optional: false
  },
  {
    key: "smtp_email",
    label: "SMTP / Email",
    description: "Outgoing email configuration readiness for production.",
    optional: false
  },
  {
    key: "google_login",
    label: "Google Login",
    description: "Customer Google sign-in configuration or launch-time disablement.",
    optional: false
  },
  {
    key: "phone_otp",
    label: "Phone OTP Provider",
    description: "Customer phone authentication provider readiness.",
    optional: false
  },
  {
    key: "payment_gateway",
    label: "Payment Gateway",
    description: "Online payment provider mode, keys, and webhook readiness.",
    optional: false
  },
  {
    key: "manual_bank_upi",
    label: "Manual Bank / UPI",
    description: "Offline bank transfer and UPI instructions used across checkout.",
    optional: false
  },
  {
    key: "shipping_courier",
    label: "Shipping / Courier Profile",
    description: "Default courier profile and tracking template for dispatch workflows.",
    optional: false
  },
  {
    key: "merchant_center",
    label: "Google Merchant Center",
    description: "Merchant Center claim details and feed URL readiness.",
    optional: false
  },
  {
    key: "seo_search_console",
    label: "SEO / Search Console",
    description: "Canonical domain, verification tags, and analytics IDs.",
    optional: false
  },
  {
    key: "meta_pixel",
    label: "Facebook / Meta Pixel",
    description: "Optional Meta pixel and catalog identifiers.",
    optional: true
  },
  {
    key: "backup_settings",
    label: "Backup Settings",
    description: "Backup directory, retention, and daily schedule planning.",
    optional: false
  },
  {
    key: "launch_checklist",
    label: "Launch Checklist",
    description: "Final go-live confirmations before the instance is marked complete.",
    optional: false
  }
]);

const SETUP_WIZARD_STEP_KEYS = Object.freeze(
  SETUP_WIZARD_STEPS.map((step) => step.key)
);

const DEFAULT_SETUP_WIZARD_SECTION = Object.freeze({
  version: 1,
  currentStep: "business_profile",
  startedAt: null,
  completedAt: null,
  lastUpdatedAt: null,
  lastUpdatedBy: "system",
  deploymentDomains: {
    storefrontDomain: "",
    adminDomain: "",
    apiDomain: ""
  },
  adminUser: {
    name: "",
    email: "",
    mobile: "",
    passwordConfigured: false
  },
  smtpEmail: {
    host: "",
    port: 587,
    secure: false,
    username: "",
    fromName: "",
    fromEmail: "",
    replyToEmail: "",
    passwordConfigured: false
  },
  googleLogin: {
    enabled: false,
    clientId: "",
    redirectUri: "",
    clientSecretConfigured: false
  },
  phoneOtp: {
    enabled: false,
    provider: "dev",
    senderId: "",
    templateId: "",
    apiBaseUrl: "",
    authTokenConfigured: false
  },
  paymentGateway: {
    providerCode: "razorpay",
    isEnabled: false,
    mode: "test",
    keyId: "",
    keySecretConfigured: false,
    webhookSecretConfigured: false
  },
  manualPayment: {
    beneficiaryName: "",
    bankName: "",
    accountHolderName: "",
    accountNumber: "",
    ifsc: "",
    upiId: "",
    instructions: ""
  },
  shippingCourier: {
    courierProfileId: "",
    courierName: "",
    courierCode: "",
    trackingUrlTemplate: "",
    trackingPageUrl: "",
    supportPhone: "",
    supportEmail: "",
    apiEnabled: false,
    apiProvider: "manual_courier",
    pickupAddress: "",
    pickupPincode: ""
  },
  merchantCenter: {
    merchantId: "",
    claimedDomain: "",
    feedUrl: "",
    targetCountry: "IN",
    language: "en"
  },
  seoSearchConsole: {
    canonicalDomain: "",
    searchConsoleVerification: "",
    bingVerification: "",
    googleAnalyticsId: "",
    googleTagManagerId: ""
  },
  metaPixel: {
    enabled: false,
    pixelId: "",
    catalogId: ""
  },
  backupSettings: {
    backupDir: "backups",
    retentionDays: 14,
    cronExpression: "0 2 * * *",
    includeUploads: true,
    includeEnvFile: true,
    runHealthCheckAfterBackup: true,
    notifyEmail: ""
  },
  launchChecklist: {
    dnsReady: false,
    sslReady: false,
    frontServed: false,
    adminServed: false,
    apiServed: false,
    backupVerified: false,
    paymentGatewayReviewed: false,
    merchantFeedReviewed: false,
    searchConsoleSubmitted: false,
    firstInvoiceTested: false
  }
});

function cloneDefaultSetupWizardSection() {
  return JSON.parse(JSON.stringify(DEFAULT_SETUP_WIZARD_SECTION));
}

module.exports = {
  SETUP_WIZARD_STEPS,
  SETUP_WIZARD_STEP_KEYS,
  DEFAULT_SETUP_WIZARD_SECTION,
  cloneDefaultSetupWizardSection
};
