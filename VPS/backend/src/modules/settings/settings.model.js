const {
  cloneDefaultSetupWizardSection
} = require("../setup-wizard/setup-wizard.model");

const SETTINGS_SECTION_MAP = Object.freeze({
  "store-profile": "storeProfile",
  branding: "branding",
  "seo-defaults": "seoDefaults",
  "contact-information": "contactInformation",
  "custom-code": "customCodeTags",
  "invoice-settings": "invoiceSettings",
  "hero-banners": "heroBanners",
  "review-settings": "reviewSettings"
});

const INVOICE_SETTINGS_UPLOAD_ASSET_MAP = Object.freeze({
  "invoice-logo": "invoiceLogoUrl",
  "authorized-signatory": "authorizedSignatoryImageUrl"
});

const DEFAULT_SETTINGS_DOCUMENT = Object.freeze({
  storeProfile: {
    storeName: "Jenix India",
    legalBusinessName: "",
    gstin: "",
    address: "",
    state: "",
    stateCode: "",
    supportEmail: "",
    supportMobile: "",
    whatsappNumber: "",
    bankName: "",
    accountHolderName: "",
    accountNumber: "",
    ifsc: "",
    upiId: "",
    businessHours: "",
    pickupAddress: ""
  },
  branding: {
    faviconUrl: "",
    brandLogoUrl: "",
    adminLogoUrl: "",
    invoiceLogoUrl: "",
    emailLogoUrl: "",
    pwaAppIconUrl: "",
    splashScreenLogoUrl: "",
    themeColor: "#ef4444",
    buttonColor: "#ef4444"
  },
  seoDefaults: {
    homeMetaTitle: "Jenix India",
    homeMetaDescription: "",
    defaultOgImageUrl: "",
    canonicalDomain: "",
    robotsTxt: "User-agent: *\nAllow: /",
    sitemapEnabled: true,
    searchConsoleVerification: "",
    bingVerification: ""
  },
  reviewSettings: {
    // "logged_in" = any signed-in customer can review; "verified_purchase"
    // = only customers with a paid order containing that product.
    eligibility: "logged_in",
    // "auto" = review goes live immediately; "gated" = stays pending until
    // an admin approves it on the Reviews page.
    moderationMode: "gated"
  },
  contactInformation: {
    publicPhone: "",
    publicEmail: "",
    publicWhatsApp: "",
    publicAddress: "",
    googleMapLink: "",
    supportTiming: "",
    socialLinks: {
      facebook: "",
      instagram: "",
      linkedin: "",
      youtube: "",
      x: ""
    }
  },
  customCodeTags: {
    customHeadHtml: "",
    customBodyStartHtml: "",
    customBodyEndHtml: "",
    customCss: "",
    customJs: "",
    googleTagManagerId: "",
    googleAnalyticsId: "",
    facebookPixelId: ""
  },
  invoiceSettings: {
    invoicePrefix: "JNX",
    invoicePostfix: "",
    financialYearFormat: "YYYY-YY",
    invoiceStartingNumber: 1,
    invoiceNumberPadding: 6,
    invoiceLogoUrl: "",
    invoiceFooter: "",
    invoiceTerms: "",
    authorizedSignatoryImageUrl: "",
    showBankDetails: true,
    showHsnSummary: true,
    showShippingLine: true,
    showDiscountLine: true,
    customInvoiceFields: []
  },
  heroBanners: {
    slides: []
  },
  setupWizard: cloneDefaultSetupWizardSection(),
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: "system"
  }
});

const BRANDING_UPLOAD_ASSET_MAP = Object.freeze({
  favicon: "faviconUrl",
  "brand-logo": "brandLogoUrl",
  "admin-logo": "adminLogoUrl",
  "invoice-logo": "invoiceLogoUrl",
  "email-logo": "emailLogoUrl",
  "pwa-app-icon": "pwaAppIconUrl",
  "splash-screen-logo": "splashScreenLogoUrl",
  "default-og-image": "defaultOgImageUrl"
});

function cloneDefaultSettingsDocument() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS_DOCUMENT));
}

function resolveSectionKey(sectionParam) {
  return SETTINGS_SECTION_MAP[sectionParam] || null;
}

function buildPublicStoreProfile(storeProfile) {
  return {
    storeName: storeProfile.storeName,
    legalBusinessName: storeProfile.legalBusinessName,
    address: storeProfile.address,
    state: storeProfile.state,
    stateCode: storeProfile.stateCode,
    supportEmail: storeProfile.supportEmail,
    supportMobile: storeProfile.supportMobile,
    whatsappNumber: storeProfile.whatsappNumber,
    businessHours: storeProfile.businessHours,
    pickupAddress: storeProfile.pickupAddress
  };
}

function buildPublicSettingsView(document) {
  return {
    storeProfile: buildPublicStoreProfile(document.storeProfile),
    branding: {
      faviconUrl: document.branding.faviconUrl,
      brandLogoUrl: document.branding.brandLogoUrl,
      pwaAppIconUrl: document.branding.pwaAppIconUrl,
      splashScreenLogoUrl: document.branding.splashScreenLogoUrl,
      themeColor: document.branding.themeColor,
      buttonColor: document.branding.buttonColor
    },
    seoDefaults: { ...document.seoDefaults },
    contactInformation: { ...document.contactInformation },
    heroBanners: {
      slides: Array.isArray(document.heroBanners?.slides)
        ? document.heroBanners.slides.filter((s) => s.isActive !== false)
        : []
    },
    meta: {
      updatedAt: document.meta.updatedAt
    }
  };
}

module.exports = {
  SETTINGS_SECTION_MAP,
  DEFAULT_SETTINGS_DOCUMENT,
  BRANDING_UPLOAD_ASSET_MAP,
  INVOICE_SETTINGS_UPLOAD_ASSET_MAP,
  cloneDefaultSettingsDocument,
  resolveSectionKey,
  buildPublicSettingsView
};
