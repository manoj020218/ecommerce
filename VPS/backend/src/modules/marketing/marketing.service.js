const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const {
  readMarketingStore,
  writeMarketingStore
} = require("../../database/marketing-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { getAllSettings } = require("../settings/settings.service");
const {
  cloneDefaultMarketingStore,
  ensureTemplateCoverage,
  fillTemplateText,
  sanitizeOffer,
  sanitizeTemplate,
  sanitizeNotificationLog
} = require("./marketing.model");

function nowIso() {
  return new Date().toISOString();
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

function resolveStoreUrls(settings) {
  const baseUrl = String(settings.seoDefaults?.canonicalDomain || env.publicBaseUrl || "")
    .trim()
    .replace(/\/$/, "");
  const normalizedBaseUrl = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;

  return {
    baseUrl: normalizedBaseUrl,
    sitemapUrl: `${normalizedBaseUrl}/sitemap.xml`,
    merchantFeedUrl: `${normalizedBaseUrl}/google-merchant-feed.xml`
  };
}

async function listOffers(filters) {
  const store = await readNormalizedMarketingStore();
  let rows = [...store.offers];

  if (!filters.includeInactive) {
    rows = rows.filter((offer) => offer.isActive);
  }

  return rows
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""))
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
  const settings = await getAllSettings();
  const urls = resolveStoreUrls(settings);

  return {
    analytics: {
      googleAnalyticsId: settings.customCodeTags?.googleAnalyticsId || "",
      facebookPixelId: settings.customCodeTags?.facebookPixelId || "",
      googleTagManagerId: settings.customCodeTags?.googleTagManagerId || ""
    },
    feeds: {
      merchantFeedUrl: urls.merchantFeedUrl,
      sitemapUrl: urls.sitemapUrl
    }
  };
}

async function sendTemplateNotification(input) {
  const [store, settings] = await Promise.all([
    readNormalizedMarketingStore(),
    getAllSettings()
  ]);
  const template = findTemplateOrThrow(store, input.templateKey);
  const urls = resolveStoreUrls(settings);
  const variables = buildTemplateVariables({
    businessName: settings.storeProfile?.storeName || "Jenix India",
    supportPhone: settings.storeProfile?.supportMobile || "",
    invoiceDownloadUrl: input.invoiceId ? `${urls.baseUrl}/account` : "",
    ...input.variables
  });
  const subject = fillTemplateText(template.subject, variables);
  const body = fillTemplateText(template.body, variables);

  const log = {
    id: generateId("notif"),
    templateKey: input.templateKey,
    toEmail: String(input.toEmail || "").trim().toLowerCase(),
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
  sendTemplateNotification,
  safeSendTemplateNotification
};
