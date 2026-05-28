const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const {
  readMarketingStore,
  writeMarketingStore
} = require("../../database/marketing-store");
const { readAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { getRecoverySummary } = require("../abandoned-cart/abandoned-cart.service");
const {
  REMINDER_SCHEDULE_MINUTES
} = require("../abandoned-cart/abandoned-cart.model");
const { getAllSettings } = require("../settings/settings.service");
const { calculateAvailableQty } = require("../products/products.model");
const {
  cloneDefaultMarketingStore,
  ensureTemplateCoverage,
  fillTemplateText,
  sanitizeOffer,
  sanitizeTemplate,
  sanitizeNotificationLog,
  sanitizeNotifySubscription
} = require("./marketing.model");

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeMobile(value) {
  return String(value || "").trim();
}

function normalizeWhatsAppNumber(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function ensureMarketingStoreShape(store) {
  const defaults = cloneDefaultMarketingStore();
  let changed = false;

  if (!Array.isArray(store.offers)) {
    store.offers = defaults.offers;
    changed = true;
  }
  if (!Array.isArray(store.emailTemplates)) {
    store.emailTemplates = defaults.emailTemplates;
    changed = true;
  }
  if (!Array.isArray(store.notificationLogs)) {
    store.notificationLogs = defaults.notificationLogs;
    changed = true;
  }
  if (!Array.isArray(store.notifySubscriptions)) {
    store.notifySubscriptions = defaults.notifySubscriptions;
    changed = true;
  }

  const covered = ensureTemplateCoverage(store.emailTemplates);
  if (covered.changed) {
    store.emailTemplates = covered.templates;
    changed = true;
  }

  return changed;
}

async function readNormalizedMarketingStore() {
  const store = await readMarketingStore();
  const changed = ensureMarketingStoreShape(store);
  if (changed) {
    await writeMarketingStore(store);
  }
  return store;
}

function buildTemplateVariables(input = {}) {
  return {
    customerName: input.customerName || "",
    orderNo: input.orderNo || "",
    invoiceNo: input.invoiceNo || "",
    paymentLink: input.paymentLink || "",
    trackingId: input.trackingId || "",
    trackingUrl: input.trackingUrl || "",
    courierName: input.courierName || "",
    cartItems: input.cartItems || "",
    invoiceDownloadUrl: input.invoiceDownloadUrl || "",
    supportPhone: input.supportPhone || "",
    businessName: input.businessName || "",
    refundAmount: input.refundAmount || "",
    productName: input.productName || "",
    pickupLocation: input.pickupLocation || "",
    pickupInstructions: input.pickupInstructions || ""
  };
}

function findTemplateOrThrow(store, templateKey) {
  const template = store.emailTemplates.find((row) => row.key === templateKey);
  if (!template) {
    throw new HttpError(404, "Email template not found.");
  }
  return template;
}

function findNotifySubscriptionOrThrow(store, subscriptionId) {
  const subscription = ensureArray(store.notifySubscriptions).find(
    (row) => row.id === subscriptionId
  );
  if (!subscription) {
    throw new HttpError(404, "Notify subscription not found.");
  }
  return subscription;
}

function resolveStoreUrls(settings) {
  const baseUrlInput = String(
    settings.seoDefaults?.canonicalDomain || env.publicBaseUrl || ""
  )
    .trim()
    .replace(/\/$/, "");

  if (!baseUrlInput) {
    return {
      baseUrl: "",
      sitemapUrl: "",
      merchantFeedUrl: "",
      facebookProductFeedUrl: ""
    };
  }

  const normalizedBaseUrl = /^https?:\/\//i.test(baseUrlInput)
    ? baseUrlInput
    : `https://${baseUrlInput}`;

  return {
    baseUrl: normalizedBaseUrl,
    sitemapUrl: `${normalizedBaseUrl}/sitemap.xml`,
    merchantFeedUrl: `${normalizedBaseUrl}/google-merchant-feed.xml`,
    facebookProductFeedUrl: `${normalizedBaseUrl}/facebook-product-feed.xml`
  };
}

function isProductAvailableForNotify(product) {
  if (!product || product.isActive === false) {
    return false;
  }

  if (product.stockStatus === "backorder") {
    return true;
  }

  return calculateAvailableQty(product) > 0 && product.stockStatus !== "out_of_stock";
}

function buildNotifySubscriptionView(subscription, catalogStore) {
  const product = catalogStore?.products?.find(
    (row) => row.id === subscription.productId
  ) || null;

  return {
    ...sanitizeNotifySubscription(subscription),
    productStatus: product?.stockStatus || "unknown",
    productIsActive: Boolean(product?.isActive),
    productIsAvailable: isProductAvailableForNotify(product)
  };
}

function buildCustomerSegments(authStore) {
  const users = ensureArray(authStore?.users);
  const since30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const segments = [
    {
      key: "all_customers",
      label: "All Customers",
      description: "Every registered customer account.",
      count: users.length
    },
    {
      key: "verified_contacts",
      label: "Verified Contacts",
      description: "Customers with verified email or verified mobile.",
      count: users.filter((user) => user.verifiedEmail || user.verifiedMobile).length
    },
    {
      key: "email_reachable",
      label: "Email Reachable",
      description: "Customers who can receive email campaigns.",
      count: users.filter((user) => Boolean(normalizeEmail(user.email))).length
    },
    {
      key: "whatsapp_reachable",
      label: "WhatsApp Reachable",
      description: "Customers with a mobile number available for future WhatsApp flows.",
      count: users.filter((user) => Boolean(normalizeMobile(user.mobile))).length
    },
    {
      key: "business_buyers",
      label: "Business Buyers",
      description: "Accounts carrying company or GST details.",
      count: users.filter(
        (user) =>
          Boolean(String(user.companyName || "").trim()) ||
          Boolean(String(user.gstDetails?.gstin || "").trim())
      ).length
    },
    {
      key: "active_last_30_days",
      label: "Active 30 Days",
      description: "Customers who logged in during the last 30 days.",
      count: users.filter((user) => {
        const lastLoginTimestamp = Date.parse(user.lastLoginAt || "");
        return !Number.isNaN(lastLoginTimestamp) && lastLoginTimestamp >= since30Days;
      }).length
    }
  ];

  return {
    totalCustomers: users.length,
    segments
  };
}

function buildNotifySubscriptionSummary(subscriptions, catalogStore) {
  const rows = ensureArray(subscriptions);
  const pendingRows = rows.filter((row) => row.status === "pending");

  return {
    totalCount: rows.length,
    pendingCount: pendingRows.length,
    notifiedCount: rows.filter((row) => row.status === "notified").length,
    cancelledCount: rows.filter((row) => row.status === "cancelled").length,
    readyToNotifyCount: pendingRows.filter((row) =>
      isProductAvailableForNotify(
        catalogStore.products.find((product) => product.id === row.productId)
      )
    ).length
  };
}

function buildNotificationLog(template, settings, input) {
  const urls = resolveStoreUrls(settings);
  const variables = buildTemplateVariables({
    businessName: settings.storeProfile?.storeName || "Jenix India",
    supportPhone: settings.storeProfile?.supportMobile || "",
    invoiceDownloadUrl: input.invoiceId ? `${urls.baseUrl}/account` : "",
    ...input.variables
  });
  const subject = fillTemplateText(template.subject, variables);
  const body = fillTemplateText(template.body, variables);

  return {
    id: generateId("notif"),
    templateKey: input.templateKey,
    toEmail: normalizeEmail(input.toEmail),
    status: !template.isActive
      ? "template_inactive"
      : !input.toEmail
        ? "skipped_no_recipient"
        : "simulated_sent",
    subject,
    body,
    variables,
    channel: "email",
    relatedResourceType: input.relatedResourceType || "",
    relatedResourceId: input.relatedResourceId || "",
    createdAt: nowIso()
  };
}

async function listOffers(filters) {
  const store = await readNormalizedMarketingStore();
  let rows = [...store.offers];

  if (!filters.includeInactive) {
    rows = rows.filter((offer) => offer.isActive);
  }

  return rows
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt || b.createdAt || "") -
        Date.parse(a.updatedAt || a.createdAt || "")
    )
    .map(sanitizeOffer);
}

async function createOffer(payload, actor) {
  const store = await readNormalizedMarketingStore();
  const now = nowIso();
  const offer = {
    id: generateId("offer"),
    ...payload,
    createdAt: now,
    updatedAt: now
  };

  store.offers.push(offer);
  await writeMarketingStore(store);

  await addActivityLog({
    action: "marketing.offer.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "offer",
    resourceId: offer.id
  });

  return sanitizeOffer(offer);
}

async function updateOffer(offerId, patch, actor) {
  const store = await readNormalizedMarketingStore();
  const index = store.offers.findIndex((offer) => offer.id === offerId);
  if (index < 0) {
    throw new HttpError(404, "Offer not found.");
  }

  const next = {
    ...store.offers[index],
    ...patch,
    updatedAt: nowIso()
  };
  store.offers[index] = next;
  await writeMarketingStore(store);

  await addActivityLog({
    action: "marketing.offer.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "offer",
    resourceId: next.id,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return sanitizeOffer(next);
}

async function listEmailTemplates() {
  const store = await readNormalizedMarketingStore();
  return store.emailTemplates.map(sanitizeTemplate);
}

async function getEmailTemplate(templateKey) {
  const store = await readNormalizedMarketingStore();
  return sanitizeTemplate(findTemplateOrThrow(store, templateKey));
}

async function updateEmailTemplate(templateKey, patch, actor) {
  const store = await readNormalizedMarketingStore();
  const index = store.emailTemplates.findIndex((row) => row.key === templateKey);
  if (index < 0) {
    throw new HttpError(404, "Email template not found.");
  }

  const next = {
    ...store.emailTemplates[index],
    ...patch,
    updatedAt: nowIso()
  };
  store.emailTemplates[index] = next;
  await writeMarketingStore(store);

  await addActivityLog({
    action: "marketing.template.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "email_template",
    resourceId: templateKey,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return sanitizeTemplate(next);
}

async function previewEmailTemplate(templateKey, variables) {
  const [store, settings] = await Promise.all([
    readNormalizedMarketingStore(),
    getAllSettings()
  ]);
  const template = findTemplateOrThrow(store, templateKey);
  const resolvedVariables = buildTemplateVariables({
    businessName: settings.storeProfile?.storeName || "Jenix India",
    supportPhone: settings.storeProfile?.supportMobile || "",
    ...variables
  });

  return {
    templateKey,
    subject: fillTemplateText(template.subject, resolvedVariables),
    body: fillTemplateText(template.body, resolvedVariables),
    variables: resolvedVariables
  };
}

async function listNotificationLogs(filters) {
  const store = await readNormalizedMarketingStore();
  let rows = [...store.notificationLogs];

  if (filters.templateKey) {
    rows = rows.filter((log) => log.templateKey === filters.templateKey);
  }
  if (filters.status) {
    rows = rows.filter((log) => log.status === filters.status);
  }

  return rows
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, filters.limit)
    .map(sanitizeNotificationLog);
}

async function getMarketingOverview() {
  const [settings, store, authStore, catalogStore, recoverySummary] = await Promise.all([
    getAllSettings(),
    readNormalizedMarketingStore(),
    readAuthStore(),
    readCatalogStore(),
    getRecoverySummary()
  ]);
  const urls = resolveStoreUrls(settings);
  const whatsappNumber =
    settings.contactInformation?.publicWhatsApp ||
    settings.storeProfile?.whatsappNumber ||
    "";
  const normalizedWhatsApp = normalizeWhatsAppNumber(whatsappNumber);
  const notifySummary = buildNotifySubscriptionSummary(
    store.notifySubscriptions,
    catalogStore
  );

  return {
    analytics: {
      googleAnalyticsId: settings.customCodeTags?.googleAnalyticsId || "",
      facebookPixelId: settings.customCodeTags?.facebookPixelId || "",
      googleTagManagerId: settings.customCodeTags?.googleTagManagerId || ""
    },
    feeds: {
      merchantFeedUrl: urls.merchantFeedUrl,
      facebookProductFeedUrl: urls.facebookProductFeedUrl,
      sitemapUrl: urls.sitemapUrl,
      sitemapEnabled: Boolean(settings.seoDefaults?.sitemapEnabled)
    },
    customerSegments: buildCustomerSegments(authStore),
    whatsappChat: {
      number: whatsappNumber,
      supportTiming: settings.contactInformation?.supportTiming || "",
      link: normalizedWhatsApp ? `https://wa.me/${normalizedWhatsApp}` : "",
      isConfigured: Boolean(normalizedWhatsApp)
    },
    abandonedCartRecovery: {
      ...recoverySummary,
      reminderScheduleMinutes: [...REMINDER_SCHEDULE_MINUTES]
    },
    notifyWhenAvailable: notifySummary,
    library: {
      offerCount: store.offers.length,
      activeOfferCount: store.offers.filter((offer) => offer.isActive).length,
      templateCount: store.emailTemplates.length,
      activeTemplateCount: store.emailTemplates.filter((template) => template.isActive).length,
      notificationLogCount: store.notificationLogs.length
    }
  };
}

async function createNotifySubscription(input, context = {}) {
  const [store, catalogStore, authStore] = await Promise.all([
    readNormalizedMarketingStore(),
    readCatalogStore(),
    context.customerId ? readAuthStore() : Promise.resolve(null)
  ]);

  const product = catalogStore.products.find((row) => row.id === input.productId && row.isActive);
  if (!product) {
    throw new HttpError(404, "Product not found.");
  }
  if (isProductAvailableForNotify(product)) {
    throw new HttpError(409, "Product is already available for ordering.");
  }

  const customer = context.customerId
    ? ensureArray(authStore?.users).find((row) => row.id === context.customerId) || null
    : null;
  const email = normalizeEmail(input.email || customer?.email || "");
  const mobile = normalizeMobile(input.mobile || customer?.mobile || "");
  const customerName = String(input.customerName || customer?.name || "").trim();

  if (!email) {
    throw new HttpError(400, "Email is required for availability notifications.");
  }

  const existing = ensureArray(store.notifySubscriptions).find(
    (row) =>
      row.productId === product.id &&
      row.status === "pending" &&
      normalizeEmail(row.email) === email
  );

  if (existing) {
    existing.customerId = context.customerId || existing.customerId || "";
    existing.customerName = customerName || existing.customerName || "";
    existing.mobile = mobile || existing.mobile || "";
    existing.sourcePage = input.sourcePage || existing.sourcePage || `/products/${product.slug}`;
    existing.updatedAt = nowIso();
    await writeMarketingStore(store);
    return buildNotifySubscriptionView(existing, catalogStore);
  }

  const timestamp = nowIso();
  const subscription = {
    id: generateId("notify_wait"),
    productId: product.id,
    productSlug: product.slug,
    productTitle: product.title,
    customerId: context.customerId || "",
    customerName,
    email,
    mobile,
    status: "pending",
    sourcePage: input.sourcePage || `/products/${product.slug}`,
    requestedAt: timestamp,
    notifiedAt: null,
    lastAttemptAt: null,
    lastAttemptStatus: "",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  store.notifySubscriptions.push(subscription);
  await writeMarketingStore(store);

  await addActivityLog({
    action: "marketing.notify_subscription.created",
    actorId: context.customerId || email,
    actorRole: context.customerId ? "customer" : "guest",
    resourceType: "notify_subscription",
    resourceId: subscription.id,
    metadata: {
      productId: product.id
    }
  });

  return buildNotifySubscriptionView(subscription, catalogStore);
}

async function listNotifySubscriptions(filters) {
  const [store, catalogStore] = await Promise.all([
    readNormalizedMarketingStore(),
    readCatalogStore()
  ]);
  let rows = [...store.notifySubscriptions];

  if (filters.productId) {
    rows = rows.filter((row) => row.productId === filters.productId);
  }
  if (filters.status) {
    rows = rows.filter((row) => row.status === filters.status);
  }

  return rows
    .sort(
      (a, b) =>
        Date.parse(b.requestedAt || b.createdAt || "") -
        Date.parse(a.requestedAt || a.createdAt || "")
    )
    .slice(0, filters.limit)
    .map((row) => buildNotifySubscriptionView(row, catalogStore));
}

async function sendNotifySubscription(subscriptionId, actor) {
  const [store, catalogStore] = await Promise.all([
    readNormalizedMarketingStore(),
    readCatalogStore()
  ]);
  const subscription = findNotifySubscriptionOrThrow(store, subscriptionId);

  if (subscription.status === "notified") {
    throw new HttpError(409, "Notification was already sent for this request.");
  }
  if (subscription.status === "cancelled") {
    throw new HttpError(409, "Cancelled notify requests cannot be sent.");
  }

  const product = catalogStore.products.find((row) => row.id === subscription.productId);
  if (!product || product.isActive === false) {
    throw new HttpError(409, "Product is not active anymore.");
  }
  if (!isProductAvailableForNotify(product)) {
    throw new HttpError(409, "Product is not available yet.");
  }

  const notificationLog = await sendTemplateNotification({
    templateKey: "notify_when_available",
    toEmail: subscription.email,
    relatedResourceType: "product",
    relatedResourceId: product.id,
    variables: {
      customerName: subscription.customerName || "Customer",
      productName: product.title
    }
  });

  const latestStore = await readNormalizedMarketingStore();
  const latestSubscription = findNotifySubscriptionOrThrow(latestStore, subscriptionId);
  const timestamp = nowIso();

  latestSubscription.productSlug = product.slug;
  latestSubscription.productTitle = product.title;
  latestSubscription.lastAttemptAt = timestamp;
  latestSubscription.lastAttemptStatus = notificationLog.status;
  latestSubscription.updatedAt = timestamp;

  if (notificationLog.status === "simulated_sent") {
    latestSubscription.status = "notified";
    latestSubscription.notifiedAt = timestamp;
  }

  await writeMarketingStore(latestStore);

  await addActivityLog({
    action: "marketing.notify_subscription.sent",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "notify_subscription",
    resourceId: latestSubscription.id,
    metadata: {
      notificationStatus: notificationLog.status,
      productId: product.id
    }
  });

  return {
    subscription: buildNotifySubscriptionView(latestSubscription, catalogStore),
    notificationLog
  };
}

async function sendTemplateNotification(input) {
  const [store, settings] = await Promise.all([
    readNormalizedMarketingStore(),
    getAllSettings()
  ]);
  const template = findTemplateOrThrow(store, input.templateKey);
  const log = buildNotificationLog(template, settings, input);

  store.notificationLogs.push(log);
  await writeMarketingStore(store);

  return sanitizeNotificationLog(log);
}

async function safeSendTemplateNotification(input) {
  try {
    return await sendTemplateNotification(input);
  } catch (_error) {
    return null;
  }
}

module.exports = {
  listOffers,
  createOffer,
  updateOffer,
  listEmailTemplates,
  getEmailTemplate,
  updateEmailTemplate,
  previewEmailTemplate,
  listNotificationLogs,
  getMarketingOverview,
  createNotifySubscription,
  listNotifySubscriptions,
  sendNotifySubscription,
  sendTemplateNotification,
  safeSendTemplateNotification
};
