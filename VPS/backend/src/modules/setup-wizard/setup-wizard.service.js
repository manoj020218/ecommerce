const bcrypt = require("bcryptjs");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { jsonFileStore } = require("../../database/json-file-store");
const {
  readPaymentStore,
  writePaymentStore
} = require("../../database/payment-store");
const {
  cloneDefaultShippingStore,
  readShippingStore,
  writeShippingStore
} = require("../../database/shipping-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { ensureAuthBootstrap } = require("../auth/auth.service");
const {
  ensurePaymentStoreShape
} = require("../payment-gateways/payment-gateways.service");
const { SHIPPING_API_PROVIDERS } = require("../shipping/shipping.model");
const {
  cloneDefaultSettingsDocument
} = require("../settings/settings.model");
const {
  SETUP_WIZARD_STEPS,
  cloneDefaultSetupWizardSection
} = require("./setup-wizard.model");

function nowIso() {
  return new Date().toISOString();
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimValue(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return trimValue(value).toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  return Boolean(value);
}

function normalizeDomain(value) {
  return trimValue(value).replace(/\/+$/, "");
}

function ensureSettingsShape(settings) {
  const defaults = cloneDefaultSettingsDocument();
  let changed = false;

  for (const [key, value] of Object.entries(defaults)) {
    if (settings[key] === undefined) {
      settings[key] = cloneValue(value);
      changed = true;
    }
  }

  if (!settings.setupWizard || typeof settings.setupWizard !== "object") {
    settings.setupWizard = cloneDefaultSetupWizardSection();
    changed = true;
  }

  return changed;
}

function ensureShippingStoreShape(store) {
  const defaults = cloneDefaultShippingStore();
  let changed = false;

  if (!Array.isArray(store.courierProfiles)) {
    store.courierProfiles = cloneValue(defaults.courierProfiles);
    changed = true;
  }

  if (!Array.isArray(store.shipments)) {
    store.shipments = cloneValue(defaults.shipments);
    changed = true;
  }

  if (!Array.isArray(store.trackingEmailLogs)) {
    store.trackingEmailLogs = cloneValue(defaults.trackingEmailLogs);
    changed = true;
  }

  if (!store.settings || typeof store.settings !== "object") {
    store.settings = cloneValue(defaults.settings);
    changed = true;
  }

  return changed;
}

function stampSettingsMeta(settings, actor) {
  settings.meta = {
    ...settings.meta,
    updatedAt: nowIso(),
    updatedBy: actor?.id || "system"
  };
}

function stampWizardMeta(settings, actor) {
  const wizard = settings.setupWizard;
  const timestamp = nowIso();

  if (!wizard.startedAt) {
    wizard.startedAt = timestamp;
  }

  wizard.lastUpdatedAt = timestamp;
  wizard.lastUpdatedBy = actor?.id || "system";
  stampSettingsMeta(settings, actor);
}

function getSuperAdmin(authStore) {
  return authStore.staffUsers.find((user) => user.role === "super_admin") || null;
}

function buildRecommendedDomains(settings) {
  const deployment = settings.setupWizard.deploymentDomains || {};
  const apiDomain = normalizeDomain(deployment.apiDomain || env.publicBaseUrl);
  const canonicalDomain = normalizeDomain(
    settings.seoDefaults?.canonicalDomain || deployment.storefrontDomain
  );
  const storefrontDomain = canonicalDomain || "https://businessdomain.com";
  const adminDomain =
    normalizeDomain(deployment.adminDomain) || "https://admin.businessdomain.com";

  return {
    storefrontDomain,
    adminDomain,
    apiDomain: apiDomain || `http://localhost:${env.port}`
  };
}

function resolveMerchantFeedUrl(settings) {
  const configured = trimValue(settings.setupWizard.merchantCenter?.feedUrl);
  if (configured) {
    return configured;
  }

  const domains = buildRecommendedDomains(settings);
  return `${normalizeDomain(domains.apiDomain)}/google-merchant-feed.xml`;
}

function gatewayLabelFromCode(code) {
  return trimValue(code)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function findGateway(paymentStore, gatewayCode) {
  const code = trimValue(gatewayCode).toLowerCase();
  return paymentStore.gateways.find(
    (gateway) => trimValue(gateway.code).toLowerCase() === code
  );
}

function ensureGateway(paymentStore, gatewayCode, gatewayType = "online") {
  const code = trimValue(gatewayCode).toLowerCase();
  let gateway = findGateway(paymentStore, code);

  if (!gateway) {
    gateway = {
      id: `pg_${generateId("wizard").replace(/^wizard_/, "")}`,
      code,
      label: gatewayLabelFromCode(code) || "Gateway",
      gatewayType,
      isEnabled: false,
      priority: paymentStore.gateways.length + 1,
      mode: "test",
      minOrderValue: 1,
      maxOrderValue: null,
      credentials: {},
      instructions: {},
      updatedAt: null
    };
    paymentStore.gateways.push(gateway);
  }

  return gateway;
}

function ensureWizardCurrentStep(settings, stepStates) {
  const firstPending = stepStates.find((step) => !step.complete);
  settings.setupWizard.currentStep =
    firstPending?.key || SETUP_WIZARD_STEPS[SETUP_WIZARD_STEPS.length - 1].key;
}

function markConfigured(section) {
  return {
    ...section,
    configured: true
  };
}

function buildForms(settings, authStore, paymentStore, shippingStore) {
  const wizard = settings.setupWizard;
  const superAdmin = getSuperAdmin(authStore);
  const paymentGateway =
    findGateway(paymentStore, wizard.paymentGateway?.providerCode || "razorpay") ||
    paymentStore.gateways[0] ||
    null;
  const manualUpiGateway = findGateway(paymentStore, "manual_upi");
  const bankTransferGateway = findGateway(paymentStore, "direct_bank_transfer");
  const courierProfile =
    shippingStore.courierProfiles.find(
      (profile) => profile.id === wizard.shippingCourier?.courierProfileId
    ) ||
    shippingStore.courierProfiles.find(
      (profile) =>
        trimValue(profile.courierCode).toUpperCase() ===
        trimValue(wizard.shippingCourier?.courierCode).toUpperCase()
    ) ||
    null;
  const recommendedDomains = buildRecommendedDomains(settings);

  return {
    business_profile: {
      storeName: settings.storeProfile.storeName || "",
      legalBusinessName: settings.storeProfile.legalBusinessName || "",
      supportEmail: settings.storeProfile.supportEmail || "",
      supportMobile: settings.storeProfile.supportMobile || "",
      whatsappNumber: settings.storeProfile.whatsappNumber || "",
      address: settings.storeProfile.address || "",
      pickupAddress: settings.storeProfile.pickupAddress || "",
      state: settings.storeProfile.state || "",
      stateCode: settings.storeProfile.stateCode || "",
      storefrontDomain:
        wizard.deploymentDomains?.storefrontDomain || recommendedDomains.storefrontDomain,
      adminDomain:
        wizard.deploymentDomains?.adminDomain || recommendedDomains.adminDomain,
      apiDomain: wizard.deploymentDomains?.apiDomain || recommendedDomains.apiDomain
    },
    logo_theme: {
      themeColor: settings.branding.themeColor || "",
      buttonColor: settings.branding.buttonColor || ""
    },
    gst_profile: {
      gstin: settings.storeProfile.gstin || "",
      state: settings.storeProfile.state || "",
      stateCode: settings.storeProfile.stateCode || ""
    },
    invoice_settings: {
      invoicePrefix: settings.invoiceSettings.invoicePrefix || "",
      invoicePostfix: settings.invoiceSettings.invoicePostfix || "",
      invoiceStartingNumber: Number(settings.invoiceSettings.invoiceStartingNumber || 1),
      invoiceNumberPadding: Number(settings.invoiceSettings.invoiceNumberPadding || 1),
      invoiceFooter: settings.invoiceSettings.invoiceFooter || "",
      invoiceTerms: settings.invoiceSettings.invoiceTerms || "",
      showBankDetails: Boolean(settings.invoiceSettings.showBankDetails),
      showHsnSummary: Boolean(settings.invoiceSettings.showHsnSummary),
      showShippingLine: Boolean(settings.invoiceSettings.showShippingLine),
      showDiscountLine: Boolean(settings.invoiceSettings.showDiscountLine)
    },
    admin_user: {
      name: superAdmin?.name || "",
      email: superAdmin?.email || "",
      mobile: superAdmin?.mobile || "",
      password: "",
      confirmPassword: "",
      passwordConfigured: Boolean(superAdmin?.passwordHash)
    },
    smtp_email: {
      host: wizard.smtpEmail?.host || "",
      port: Number(wizard.smtpEmail?.port || 587),
      secure: Boolean(wizard.smtpEmail?.secure),
      username: wizard.smtpEmail?.username || "",
      fromName: wizard.smtpEmail?.fromName || "",
      fromEmail: wizard.smtpEmail?.fromEmail || "",
      replyToEmail: wizard.smtpEmail?.replyToEmail || "",
      password: "",
      passwordConfigured: Boolean(wizard.smtpEmail?.passwordConfigured),
      configured: Boolean(wizard.smtpEmail?.configured)
    },
    google_login: {
      enabled: Boolean(wizard.googleLogin?.enabled),
      clientId: wizard.googleLogin?.clientId || "",
      redirectUri: wizard.googleLogin?.redirectUri || "",
      clientSecret: "",
      clientSecretConfigured: Boolean(wizard.googleLogin?.clientSecretConfigured),
      configured: Boolean(wizard.googleLogin?.configured)
    },
    phone_otp: {
      enabled: Boolean(wizard.phoneOtp?.enabled),
      provider: wizard.phoneOtp?.provider || "dev",
      senderId: wizard.phoneOtp?.senderId || "",
      templateId: wizard.phoneOtp?.templateId || "",
      apiBaseUrl: wizard.phoneOtp?.apiBaseUrl || "",
      authToken: "",
      authTokenConfigured: Boolean(wizard.phoneOtp?.authTokenConfigured),
      configured: Boolean(wizard.phoneOtp?.configured)
    },
    payment_gateway: {
      providerCode: paymentGateway?.code || wizard.paymentGateway?.providerCode || "razorpay",
      isEnabled:
        paymentGateway?.isEnabled !== undefined
          ? Boolean(paymentGateway.isEnabled)
          : Boolean(wizard.paymentGateway?.isEnabled),
      mode: paymentGateway?.mode || wizard.paymentGateway?.mode || "test",
      keyId:
        paymentGateway?.credentials?.keyId ||
        wizard.paymentGateway?.keyId ||
        "",
      keySecret: "",
      webhookSecret: "",
      keySecretConfigured: Boolean(
        paymentGateway?.credentials?.keySecret ||
          wizard.paymentGateway?.keySecretConfigured
      ),
      webhookSecretConfigured: Boolean(
        paymentGateway?.credentials?.webhookSecret ||
          wizard.paymentGateway?.webhookSecretConfigured
      ),
      // Payment Gateways has its own full admin page — most admins configure
      // Razorpay/Cashfree there directly and never touch this wizard step, so
      // gating "done" purely on wizard.paymentGateway.configured (only ever
      // set by submitting this step's own form) left a genuinely working,
      // fully-credentialed gateway stuck showing "Pending" forever. Treat it
      // as configured if real credentials exist too, so this step reflects
      // live reality either way.
      configured: Boolean(
        wizard.paymentGateway?.configured ||
          (paymentGateway?.credentials?.keyId && paymentGateway?.credentials?.keySecret)
      )
    },
    manual_bank_upi: {
      beneficiaryName:
        wizard.manualPayment?.beneficiaryName ||
        manualUpiGateway?.instructions?.beneficiaryName ||
        bankTransferGateway?.instructions?.beneficiaryName ||
        "",
      bankName:
        settings.storeProfile.bankName ||
        bankTransferGateway?.instructions?.bankName ||
        "",
      accountHolderName: settings.storeProfile.accountHolderName || "",
      accountNumber:
        settings.storeProfile.accountNumber ||
        bankTransferGateway?.instructions?.accountNumber ||
        "",
      ifsc:
        settings.storeProfile.ifsc || bankTransferGateway?.instructions?.ifsc || "",
      upiId:
        settings.storeProfile.upiId || manualUpiGateway?.instructions?.upiId || "",
      instructions:
        wizard.manualPayment?.instructions ||
        manualUpiGateway?.instructions?.instructions ||
        ""
    },
    shipping_courier: {
      courierName:
        courierProfile?.courierName || wizard.shippingCourier?.courierName || "",
      courierCode:
        courierProfile?.courierCode || wizard.shippingCourier?.courierCode || "",
      trackingUrlTemplate:
        courierProfile?.trackingUrlTemplate ||
        wizard.shippingCourier?.trackingUrlTemplate ||
        "",
      trackingPageUrl:
        courierProfile?.trackingPageUrl || wizard.shippingCourier?.trackingPageUrl || "",
      supportPhone:
        courierProfile?.supportPhone || wizard.shippingCourier?.supportPhone || "",
      supportEmail:
        courierProfile?.supportEmail || wizard.shippingCourier?.supportEmail || "",
      apiEnabled:
        courierProfile?.apiEnabled !== undefined
          ? Boolean(courierProfile.apiEnabled)
          : Boolean(wizard.shippingCourier?.apiEnabled),
      apiProvider:
        courierProfile?.apiProvider ||
        wizard.shippingCourier?.apiProvider ||
        SHIPPING_API_PROVIDERS.MANUAL_COURIER,
      pickupAddress:
        wizard.shippingCourier?.pickupAddress || settings.storeProfile.pickupAddress || "",
      pickupPincode: wizard.shippingCourier?.pickupPincode || ""
    },
    merchant_center: {
      merchantId: wizard.merchantCenter?.merchantId || "",
      claimedDomain:
        wizard.merchantCenter?.claimedDomain || recommendedDomains.storefrontDomain,
      feedUrl: resolveMerchantFeedUrl(settings),
      targetCountry: wizard.merchantCenter?.targetCountry || "IN",
      language: wizard.merchantCenter?.language || "en"
    },
    seo_search_console: {
      canonicalDomain:
        settings.seoDefaults.canonicalDomain || recommendedDomains.storefrontDomain,
      searchConsoleVerification: settings.seoDefaults.searchConsoleVerification || "",
      bingVerification: settings.seoDefaults.bingVerification || "",
      googleAnalyticsId: settings.customCodeTags.googleAnalyticsId || "",
      googleTagManagerId: settings.customCodeTags.googleTagManagerId || ""
    },
    meta_pixel: {
      enabled: Boolean(wizard.metaPixel?.enabled),
      pixelId: settings.customCodeTags.facebookPixelId || wizard.metaPixel?.pixelId || "",
      catalogId: wizard.metaPixel?.catalogId || "",
      configured: Boolean(wizard.metaPixel?.configured)
    },
    backup_settings: {
      backupDir: wizard.backupSettings?.backupDir || "backups",
      retentionDays: Number(wizard.backupSettings?.retentionDays || 14),
      cronExpression: wizard.backupSettings?.cronExpression || "0 2 * * *",
      includeUploads: wizard.backupSettings?.includeUploads !== false,
      includeEnvFile: wizard.backupSettings?.includeEnvFile !== false,
      runHealthCheckAfterBackup:
        wizard.backupSettings?.runHealthCheckAfterBackup !== false,
      notifyEmail: wizard.backupSettings?.notifyEmail || "",
      configured: Boolean(wizard.backupSettings?.configured)
    },
    launch_checklist: {
      dnsReady: Boolean(wizard.launchChecklist?.dnsReady),
      sslReady: Boolean(wizard.launchChecklist?.sslReady),
      frontServed: Boolean(wizard.launchChecklist?.frontServed),
      adminServed: Boolean(wizard.launchChecklist?.adminServed),
      apiServed: Boolean(wizard.launchChecklist?.apiServed),
      backupVerified: Boolean(wizard.launchChecklist?.backupVerified),
      paymentGatewayReviewed: Boolean(wizard.launchChecklist?.paymentGatewayReviewed),
      merchantFeedReviewed: Boolean(wizard.launchChecklist?.merchantFeedReviewed),
      searchConsoleSubmitted: Boolean(wizard.launchChecklist?.searchConsoleSubmitted),
      firstInvoiceTested: Boolean(wizard.launchChecklist?.firstInvoiceTested)
    }
  };
}

function buildStepState(step, forms) {
  const fieldMap = {
    business_profile: [
      ["storeName", forms.business_profile.storeName],
      ["supportEmail", forms.business_profile.supportEmail],
      ["supportMobile", forms.business_profile.supportMobile],
      ["address", forms.business_profile.address],
      ["state", forms.business_profile.state],
      ["stateCode", forms.business_profile.stateCode],
      ["storefrontDomain", forms.business_profile.storefrontDomain],
      ["adminDomain", forms.business_profile.adminDomain],
      ["apiDomain", forms.business_profile.apiDomain]
    ],
    logo_theme: [
      ["themeColor", forms.logo_theme.themeColor],
      ["buttonColor", forms.logo_theme.buttonColor]
    ],
    gst_profile: [
      ["gstin", forms.gst_profile.gstin],
      ["state", forms.gst_profile.state],
      ["stateCode", forms.gst_profile.stateCode]
    ],
    invoice_settings: [
      ["invoicePrefix", forms.invoice_settings.invoicePrefix],
      ["invoiceStartingNumber", forms.invoice_settings.invoiceStartingNumber],
      ["invoiceNumberPadding", forms.invoice_settings.invoiceNumberPadding]
    ],
    admin_user: [
      ["name", forms.admin_user.name],
      ["email", forms.admin_user.email],
      ["passwordConfigured", forms.admin_user.passwordConfigured]
    ],
    manual_bank_upi: [
      ["beneficiaryName", forms.manual_bank_upi.beneficiaryName],
      ["bankName", forms.manual_bank_upi.bankName],
      ["accountHolderName", forms.manual_bank_upi.accountHolderName],
      ["accountNumber", forms.manual_bank_upi.accountNumber],
      ["ifsc", forms.manual_bank_upi.ifsc],
      ["upiId", forms.manual_bank_upi.upiId],
      ["instructions", forms.manual_bank_upi.instructions]
    ],
    shipping_courier: [
      ["courierName", forms.shipping_courier.courierName],
      ["courierCode", forms.shipping_courier.courierCode],
      ["trackingUrlTemplate", forms.shipping_courier.trackingUrlTemplate],
      ["pickupAddress", forms.shipping_courier.pickupAddress]
    ],
    merchant_center: [
      ["claimedDomain", forms.merchant_center.claimedDomain],
      ["feedUrl", forms.merchant_center.feedUrl],
      ["targetCountry", forms.merchant_center.targetCountry]
    ],
    seo_search_console: [
      ["canonicalDomain", forms.seo_search_console.canonicalDomain],
      [
        "searchConsoleVerification",
        forms.seo_search_console.searchConsoleVerification
      ]
    ]
  };

  const explicitFieldMap = {
    smtp_email: {
      configured: forms.smtp_email.configured,
      complete:
        Boolean(forms.smtp_email.host) &&
        Boolean(forms.smtp_email.port) &&
        Boolean(forms.smtp_email.username) &&
        Boolean(forms.smtp_email.fromEmail) &&
        Boolean(forms.smtp_email.passwordConfigured),
      missingFields: [
        ["host", forms.smtp_email.host],
        ["port", forms.smtp_email.port],
        ["username", forms.smtp_email.username],
        ["fromEmail", forms.smtp_email.fromEmail],
        ["passwordConfigured", forms.smtp_email.passwordConfigured]
      ]
    },
    google_login: {
      configured: forms.google_login.configured,
      complete:
        forms.google_login.enabled === false ||
        (Boolean(forms.google_login.clientId) &&
          Boolean(forms.google_login.redirectUri) &&
          Boolean(forms.google_login.clientSecretConfigured)),
      missingFields: [
        ["clientId", forms.google_login.clientId],
        ["redirectUri", forms.google_login.redirectUri],
        ["clientSecretConfigured", forms.google_login.clientSecretConfigured]
      ]
    },
    phone_otp: {
      configured: forms.phone_otp.configured,
      complete:
        forms.phone_otp.enabled === false ||
        (Boolean(forms.phone_otp.provider) &&
          Boolean(forms.phone_otp.senderId) &&
          Boolean(forms.phone_otp.authTokenConfigured)),
      missingFields: [
        ["provider", forms.phone_otp.provider],
        ["senderId", forms.phone_otp.senderId],
        ["authTokenConfigured", forms.phone_otp.authTokenConfigured]
      ]
    },
    payment_gateway: {
      configured: forms.payment_gateway.configured,
      complete:
        Boolean(forms.payment_gateway.providerCode) &&
        (forms.payment_gateway.isEnabled === false ||
          (Boolean(forms.payment_gateway.keyId) &&
            Boolean(forms.payment_gateway.keySecretConfigured))),
      missingFields: [
        ["providerCode", forms.payment_gateway.providerCode],
        ["keyId", forms.payment_gateway.keyId],
        ["keySecretConfigured", forms.payment_gateway.keySecretConfigured]
      ]
    },
    meta_pixel: {
      configured: true,
      complete:
        forms.meta_pixel.enabled === false || Boolean(forms.meta_pixel.pixelId),
      missingFields: [["pixelId", forms.meta_pixel.pixelId]]
    },
    backup_settings: {
      configured: forms.backup_settings.configured,
      complete:
        Boolean(forms.backup_settings.backupDir) &&
        Boolean(forms.backup_settings.retentionDays) &&
        Boolean(forms.backup_settings.cronExpression),
      missingFields: [
        ["backupDir", forms.backup_settings.backupDir],
        ["retentionDays", forms.backup_settings.retentionDays],
        ["cronExpression", forms.backup_settings.cronExpression]
      ]
    },
    launch_checklist: {
      configured: true,
      complete:
        forms.launch_checklist.dnsReady &&
        forms.launch_checklist.sslReady &&
        forms.launch_checklist.frontServed &&
        forms.launch_checklist.adminServed &&
        forms.launch_checklist.apiServed &&
        forms.launch_checklist.backupVerified &&
        forms.launch_checklist.paymentGatewayReviewed &&
        forms.launch_checklist.merchantFeedReviewed &&
        forms.launch_checklist.searchConsoleSubmitted &&
        forms.launch_checklist.firstInvoiceTested,
      missingFields: Object.entries(forms.launch_checklist).map(([key, value]) => [
        key,
        value
      ])
    }
  };

  if (fieldMap[step.key]) {
    const missingFields = fieldMap[step.key]
      .filter(([, value]) => !value)
      .map(([field]) => field);

    return {
      ...step,
      complete: missingFields.length === 0,
      missingFields
    };
  }

  const explicit = explicitFieldMap[step.key];
  if (!explicit) {
    return {
      ...step,
      complete: false,
      missingFields: []
    };
  }

  if (!explicit.configured && !step.optional) {
    return {
      ...step,
      complete: false,
      missingFields: explicit.missingFields.map(([field]) => field)
    };
  }

  return {
    ...step,
    complete: explicit.complete,
    missingFields: explicit.missingFields
      .filter(([, value]) => !value)
      .map(([field]) => field)
  };
}

function buildOverview(forms) {
  const steps = SETUP_WIZARD_STEPS.map((step) => buildStepState(step, forms));
  const completedCount = steps.filter((step) => step.complete).length;
  const totalCount = steps.length;
  const firstPendingStepKey = steps.find((step) => !step.complete)?.key || null;

  return {
    completedCount,
    totalCount,
    completionPercent: Math.round((completedCount / totalCount) * 100),
    firstPendingStepKey,
    steps
  };
}

function buildWizardSummary(settings, overview) {
  return {
    version: settings.setupWizard.version || 1,
    currentStep:
      settings.setupWizard.currentStep || overview.firstPendingStepKey || SETUP_WIZARD_STEPS[0].key,
    startedAt: settings.setupWizard.startedAt || null,
    completedAt: settings.setupWizard.completedAt || null,
    lastUpdatedAt: settings.setupWizard.lastUpdatedAt || null,
    lastUpdatedBy: settings.setupWizard.lastUpdatedBy || "system"
  };
}

function buildAdminResponse(settings, authStore, paymentStore, shippingStore) {
  const forms = buildForms(settings, authStore, paymentStore, shippingStore);
  const overview = buildOverview(forms);

  return {
    wizard: buildWizardSummary(settings, overview),
    overview,
    recommendedDomains: buildRecommendedDomains(settings),
    assets: {
      branding: {
        brandLogoUrl: settings.branding.brandLogoUrl || "",
        adminLogoUrl: settings.branding.adminLogoUrl || "",
        faviconUrl: settings.branding.faviconUrl || "",
        defaultOgImageUrl: settings.seoDefaults.defaultOgImageUrl || ""
      }
    },
    options: {
      shippingApiProviders: Object.values(SHIPPING_API_PROVIDERS),
      paymentGatewayCodes: paymentStore.gateways.map((gateway) => gateway.code)
    },
    forms
  };
}

async function loadState() {
  const [settings, authStore, paymentStore, shippingStore] = await Promise.all([
    jsonFileStore.readSettingsDocument(),
    ensureAuthBootstrap(),
    readPaymentStore(),
    readShippingStore()
  ]);

  const settingsChanged = ensureSettingsShape(settings);
  const paymentChanged = ensurePaymentStoreShape(paymentStore);
  const shippingChanged = ensureShippingStoreShape(shippingStore);

  if (settingsChanged) {
    await jsonFileStore.writeSettingsDocument(settings);
  }
  if (paymentChanged) {
    await writePaymentStore(paymentStore);
  }
  if (shippingChanged) {
    await writeShippingStore(shippingStore);
  }

  return {
    settings,
    authStore,
    paymentStore,
    shippingStore
  };
}

function mergeDefined(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      target[key] = value;
    }
  }
}

async function getPublicSetupWizardBootstrap() {
  const { settings, authStore, paymentStore, shippingStore } = await loadState();
  const adminView = buildAdminResponse(settings, authStore, paymentStore, shippingStore);

  return {
    wizard: adminView.wizard,
    overview: adminView.overview,
    recommendedDomains: adminView.recommendedDomains,
    readiness: {
      isCompleted: Boolean(settings.setupWizard.completedAt),
      firstAdminConfigured: Boolean(adminView.forms.admin_user.email),
      backupConfigured: Boolean(adminView.forms.backup_settings.configured)
    }
  };
}

async function getAdminSetupWizard() {
  const { settings, authStore, paymentStore, shippingStore } = await loadState();
  return buildAdminResponse(settings, authStore, paymentStore, shippingStore);
}

async function saveSetupWizardStep(stepKey, payload, actor) {
  const state = await loadState();
  const { settings, authStore, paymentStore, shippingStore } = state;
  const wizard = settings.setupWizard;
  const timestamp = nowIso();

  switch (stepKey) {
    case "business_profile":
      mergeDefined(settings.storeProfile, {
        storeName: payload.storeName,
        legalBusinessName: payload.legalBusinessName,
        supportEmail: payload.supportEmail,
        supportMobile: payload.supportMobile,
        whatsappNumber: payload.whatsappNumber,
        address: payload.address,
        pickupAddress: payload.pickupAddress,
        state: payload.state,
        stateCode: payload.stateCode
      });
      wizard.deploymentDomains = {
        ...wizard.deploymentDomains,
        storefrontDomain: normalizeDomain(payload.storefrontDomain),
        adminDomain: normalizeDomain(payload.adminDomain),
        apiDomain: normalizeDomain(payload.apiDomain)
      };
      break;
    case "logo_theme":
      mergeDefined(settings.branding, {
        themeColor: payload.themeColor,
        buttonColor: payload.buttonColor
      });
      break;
    case "gst_profile":
      mergeDefined(settings.storeProfile, {
        gstin: payload.gstin,
        state: payload.state,
        stateCode: payload.stateCode
      });
      break;
    case "invoice_settings":
      mergeDefined(settings.invoiceSettings, payload);
      break;
    case "admin_user": {
      const superAdmin = getSuperAdmin(authStore);
      if (!superAdmin) {
        throw new HttpError(404, "Super admin account not found.");
      }

      if (payload.name !== undefined) {
        superAdmin.name = payload.name;
      }
      if (payload.email !== undefined) {
        superAdmin.email = normalizeEmail(payload.email);
      }
      if (payload.mobile !== undefined) {
        superAdmin.mobile = trimValue(payload.mobile);
      }
      if (payload.password) {
        superAdmin.passwordHash = await bcrypt.hash(payload.password, 10);
      }
      superAdmin.updatedAt = timestamp;

      wizard.adminUser = {
        ...wizard.adminUser,
        name: superAdmin.name,
        email: superAdmin.email,
        mobile: superAdmin.mobile,
        passwordConfigured: Boolean(superAdmin.passwordHash)
      };
      break;
    }
    case "smtp_email":
      wizard.smtpEmail = markConfigured({
        ...wizard.smtpEmail,
        host: payload.host,
        port: payload.port ?? wizard.smtpEmail.port,
        secure: normalizeBoolean(payload.secure, wizard.smtpEmail.secure),
        username: payload.username,
        fromName: payload.fromName,
        fromEmail: payload.fromEmail,
        replyToEmail: payload.replyToEmail,
        password: payload.password || wizard.smtpEmail?.password || "",
        passwordConfigured:
          Boolean(payload.password) || Boolean(wizard.smtpEmail.passwordConfigured)
      });
      break;
    case "google_login":
      wizard.googleLogin = markConfigured({
        ...wizard.googleLogin,
        enabled: normalizeBoolean(payload.enabled, wizard.googleLogin.enabled),
        clientId: payload.clientId,
        redirectUri: payload.redirectUri,
        clientSecretConfigured:
          Boolean(payload.clientSecret) ||
          Boolean(wizard.googleLogin.clientSecretConfigured)
      });
      break;
    case "phone_otp":
      wizard.phoneOtp = markConfigured({
        ...wizard.phoneOtp,
        enabled: normalizeBoolean(payload.enabled, wizard.phoneOtp.enabled),
        provider: payload.provider,
        senderId: payload.senderId,
        templateId: payload.templateId,
        apiBaseUrl: payload.apiBaseUrl,
        authTokenConfigured:
          Boolean(payload.authToken) || Boolean(wizard.phoneOtp.authTokenConfigured)
      });
      break;
    case "payment_gateway": {
      const gateway = ensureGateway(paymentStore, payload.providerCode || "razorpay");
      gateway.code = trimValue(payload.providerCode || gateway.code).toLowerCase();
      gateway.label = gateway.label || gatewayLabelFromCode(gateway.code);
      gateway.isEnabled = normalizeBoolean(payload.isEnabled, gateway.isEnabled);
      gateway.mode = payload.mode || gateway.mode || "test";
      gateway.credentials = {
        ...gateway.credentials,
        keyId:
          payload.keyId !== undefined ? payload.keyId : gateway.credentials?.keyId || "",
        keySecret:
          payload.keySecret || gateway.credentials?.keySecret || "",
        webhookSecret:
          payload.webhookSecret || gateway.credentials?.webhookSecret || ""
      };
      gateway.updatedAt = timestamp;

      wizard.paymentGateway = markConfigured({
        ...wizard.paymentGateway,
        providerCode: gateway.code,
        isEnabled: gateway.isEnabled,
        mode: gateway.mode,
        keyId: gateway.credentials.keyId || "",
        keySecretConfigured: Boolean(gateway.credentials.keySecret),
        webhookSecretConfigured: Boolean(gateway.credentials.webhookSecret)
      });
      break;
    }
    case "manual_bank_upi": {
      mergeDefined(settings.storeProfile, {
        bankName: payload.bankName,
        accountHolderName: payload.accountHolderName,
        accountNumber: payload.accountNumber,
        ifsc: payload.ifsc,
        upiId: payload.upiId
      });

      wizard.manualPayment = {
        ...wizard.manualPayment,
        beneficiaryName: payload.beneficiaryName,
        bankName: payload.bankName,
        accountHolderName: payload.accountHolderName,
        accountNumber: payload.accountNumber,
        ifsc: payload.ifsc,
        upiId: payload.upiId,
        instructions: payload.instructions
      };

      const manualUpiGateway = ensureGateway(paymentStore, "manual_upi", "manual");
      manualUpiGateway.gatewayType = "manual";
      manualUpiGateway.isEnabled = true;
      manualUpiGateway.instructions = {
        ...manualUpiGateway.instructions,
        beneficiaryName: payload.beneficiaryName,
        upiId: payload.upiId,
        instructions: payload.instructions
      };
      manualUpiGateway.updatedAt = timestamp;

      const bankTransferGateway = ensureGateway(
        paymentStore,
        "direct_bank_transfer",
        "manual"
      );
      bankTransferGateway.gatewayType = "manual";
      bankTransferGateway.isEnabled = true;
      bankTransferGateway.instructions = {
        ...bankTransferGateway.instructions,
        beneficiaryName: payload.beneficiaryName,
        bankName: payload.bankName,
        accountNumber: payload.accountNumber,
        ifsc: payload.ifsc,
        instructions: payload.instructions
      };
      bankTransferGateway.updatedAt = timestamp;
      break;
    }
    case "shipping_courier": {
      const normalizedCode = trimValue(payload.courierCode).toUpperCase();
      // Match by courier code, not by the profile this step last touched —
      // matching by the previously-bound courierProfileId meant re-using this
      // step to enter a second, different courier silently overwrote the
      // first one instead of adding a new profile. Matching by code means a
      // repeat submission of the same code still edits that courier in
      // place, while a new code always creates a new courier profile.
      let courierProfile =
        shippingStore.courierProfiles.find(
          (profile) => trimValue(profile.courierCode).toUpperCase() === normalizedCode
        ) || null;

      if (!courierProfile) {
        courierProfile = {
          id: generateId("courier"),
          createdAt: timestamp
        };
        shippingStore.courierProfiles.push(courierProfile);
      }

      Object.assign(courierProfile, {
        courierName: payload.courierName,
        courierCode: normalizedCode,
        trackingUrlTemplate: payload.trackingUrlTemplate,
        trackingPageUrl: payload.trackingPageUrl,
        supportPhone: payload.supportPhone,
        supportEmail: payload.supportEmail,
        apiEnabled: normalizeBoolean(payload.apiEnabled, courierProfile.apiEnabled),
        apiProvider: payload.apiProvider || SHIPPING_API_PROVIDERS.MANUAL_COURIER,
        isActive: true,
        updatedAt: timestamp
      });

      if (payload.pickupAddress) {
        settings.storeProfile.pickupAddress = payload.pickupAddress;
      }

      wizard.shippingCourier = {
        ...wizard.shippingCourier,
        courierProfileId: courierProfile.id,
        courierName: courierProfile.courierName,
        courierCode: courierProfile.courierCode,
        trackingUrlTemplate: courierProfile.trackingUrlTemplate,
        trackingPageUrl: courierProfile.trackingPageUrl || "",
        supportPhone: courierProfile.supportPhone || "",
        supportEmail: courierProfile.supportEmail || "",
        apiEnabled: Boolean(courierProfile.apiEnabled),
        apiProvider: courierProfile.apiProvider,
        pickupAddress: payload.pickupAddress,
        pickupPincode: payload.pickupPincode
      };
      break;
    }
    case "merchant_center":
      wizard.merchantCenter = {
        ...wizard.merchantCenter,
        merchantId: payload.merchantId,
        claimedDomain: normalizeDomain(payload.claimedDomain),
        feedUrl:
          normalizeDomain(payload.feedUrl) ||
          `${normalizeDomain(
            wizard.deploymentDomains?.apiDomain || env.publicBaseUrl
          )}/google-merchant-feed.xml`,
        targetCountry: payload.targetCountry || "IN",
        language: payload.language || "en"
      };
      break;
    case "seo_search_console":
      mergeDefined(settings.seoDefaults, {
        canonicalDomain: normalizeDomain(payload.canonicalDomain),
        searchConsoleVerification: payload.searchConsoleVerification,
        bingVerification: payload.bingVerification
      });
      mergeDefined(settings.customCodeTags, {
        googleAnalyticsId: payload.googleAnalyticsId,
        googleTagManagerId: payload.googleTagManagerId
      });
      wizard.seoSearchConsole = {
        ...wizard.seoSearchConsole,
        canonicalDomain: settings.seoDefaults.canonicalDomain,
        searchConsoleVerification: settings.seoDefaults.searchConsoleVerification,
        bingVerification: settings.seoDefaults.bingVerification,
        googleAnalyticsId: settings.customCodeTags.googleAnalyticsId,
        googleTagManagerId: settings.customCodeTags.googleTagManagerId
      };
      break;
    case "meta_pixel":
      wizard.metaPixel = markConfigured({
        ...wizard.metaPixel,
        enabled: normalizeBoolean(payload.enabled, wizard.metaPixel.enabled),
        pixelId: payload.pixelId,
        catalogId: payload.catalogId
      });
      settings.customCodeTags.facebookPixelId = payload.enabled ? payload.pixelId : "";
      break;
    case "backup_settings":
      wizard.backupSettings = markConfigured({
        ...wizard.backupSettings,
        backupDir: payload.backupDir,
        retentionDays: payload.retentionDays ?? wizard.backupSettings.retentionDays,
        cronExpression: payload.cronExpression,
        includeUploads: normalizeBoolean(
          payload.includeUploads,
          wizard.backupSettings.includeUploads
        ),
        includeEnvFile: normalizeBoolean(
          payload.includeEnvFile,
          wizard.backupSettings.includeEnvFile
        ),
        runHealthCheckAfterBackup: normalizeBoolean(
          payload.runHealthCheckAfterBackup,
          wizard.backupSettings.runHealthCheckAfterBackup
        ),
        notifyEmail: payload.notifyEmail
      });
      break;
    case "launch_checklist":
      wizard.launchChecklist = {
        ...wizard.launchChecklist,
        ...payload
      };
      break;
    default:
      throw new HttpError(404, "Setup wizard step not found.");
  }

  stampWizardMeta(settings, actor);

  const nextResponse = buildAdminResponse(settings, authStore, paymentStore, shippingStore);
  ensureWizardCurrentStep(settings, nextResponse.overview.steps);
  if (nextResponse.overview.firstPendingStepKey) {
    settings.setupWizard.completedAt = null;
  }

  await Promise.all([
    jsonFileStore.writeSettingsDocument(settings),
    writeAuthStore(authStore),
    writePaymentStore(paymentStore),
    writeShippingStore(shippingStore)
  ]);

  await jsonFileStore.appendSettingsAuditLog({
    action: "setup_wizard.step.saved",
    stepKey,
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    timestamp: settings.setupWizard.lastUpdatedAt
  });

  await addActivityLog({
    action: "setup_wizard.step.saved",
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    resourceType: "setup_wizard",
    resourceId: stepKey
  });

  return buildAdminResponse(settings, authStore, paymentStore, shippingStore);
}

async function completeSetupWizard(actor) {
  const { settings, authStore, paymentStore, shippingStore } = await loadState();
  const adminView = buildAdminResponse(settings, authStore, paymentStore, shippingStore);
  const blockingSteps = adminView.overview.steps.filter(
    (step) => !step.optional && !step.complete
  );

  if (blockingSteps.length > 0) {
    throw new HttpError(409, "Complete all required setup wizard steps first.", {
      pendingSteps: blockingSteps.map((step) => ({
        key: step.key,
        label: step.label,
        missingFields: step.missingFields
      }))
    });
  }

  settings.setupWizard.completedAt = nowIso();
  stampWizardMeta(settings, actor);
  ensureWizardCurrentStep(settings, adminView.overview.steps);

  await jsonFileStore.writeSettingsDocument(settings);
  await jsonFileStore.appendSettingsAuditLog({
    action: "setup_wizard.completed",
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    timestamp: settings.setupWizard.completedAt
  });
  await addActivityLog({
    action: "setup_wizard.completed",
    actorId: actor?.id || "unknown",
    actorRole: actor?.role || "unknown",
    resourceType: "setup_wizard",
    resourceId: "completion"
  });

  return buildAdminResponse(settings, authStore, paymentStore, shippingStore);
}

module.exports = {
  getPublicSetupWizardBootstrap,
  getAdminSetupWizard,
  saveSetupWizardStep,
  completeSetupWizard
};
