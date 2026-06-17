const OFFER_TYPES = Object.freeze([
  "time_bound",
  "amount_based",
  "product_based",
  "category_based",
  "customer_type_based",
  "dealer_stockist_offer",
  "direct_payment_discount"
]);

const TEMPLATE_KEYS = Object.freeze([
  "login_success",
  "customer_verification_email",
  "forgot_password",
  "otp_login_code",
  "order_placed",
  "awaiting_payment",
  "payment_failed",
  "payment_successful",
  "manual_payment_submitted",
  "manual_payment_verified",
  "order_left_in_cart",
  "cart_reminder",
  "fulfilment_started",
  "order_dispatched",
  "tracking_detail_update",
  "order_delivered",
  "shipment_feedback",
  "refund_successful",
  "notify_when_available",
  "bulk_quote_received",
  "dealer_order_request_received",
  "dealer_order_approved",
  "ready_for_pickup",
  "self_pickup_completed"
]);

const TEMPLATE_VARIABLES = Object.freeze([
  "customerName",
  "orderNo",
  "invoiceNo",
  "paymentLink",
  "resetPasswordUrl",
  "trackingId",
  "trackingUrl",
  "courierName",
  "cartItems",
  "invoiceDownloadUrl",
  "supportPhone",
  "businessName",
  "refundAmount",
  "productName",
  "pickupLocation",
  "pickupInstructions"
]);

const NOTIFY_SUBSCRIPTION_STATUSES = Object.freeze([
  "pending",
  "notified",
  "cancelled"
]);

function createDefaultTemplate(key) {
  return {
    key,
    channel: "email",
    label: key
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    subject: `[Jenix] ${key.replace(/_/g, " ")}`,
    body: [
      "Hello {{customerName}},",
      "",
      `This is a ${key.replace(/_/g, " ")} update from {{businessName}}.`,
      "Order: {{orderNo}}",
      "Invoice: {{invoiceNo}}",
      "Tracking: {{trackingId}}",
      "Tracking URL: {{trackingUrl}}",
      "Payment link: {{paymentLink}}",
      "Reset password URL: {{resetPasswordUrl}}",
      "Support: {{supportPhone}}",
      "",
      "Thank you."
    ].join("\n"),
    variables: [...TEMPLATE_VARIABLES],
    isActive: true,
    updatedAt: null
  };
}

function cloneDefaultMarketingStore() {
  return {
    offers: [],
    emailTemplates: TEMPLATE_KEYS.map(createDefaultTemplate),
    notificationLogs: [],
    notifySubscriptions: []
  };
}

function ensureTemplateCoverage(templates) {
  const rows = Array.isArray(templates) ? [...templates] : [];
  const byKey = new Map(rows.map((template) => [template.key, template]));
  let changed = false;

  for (const key of TEMPLATE_KEYS) {
    if (byKey.has(key)) {
      continue;
    }
    rows.push(createDefaultTemplate(key));
    changed = true;
  }

  return { templates: rows, changed };
}

function fillTemplateText(text, variables) {
  let output = String(text || "");
  for (const key of TEMPLATE_VARIABLES) {
    const value = variables[key];
    output = output.replaceAll(`{{${key}}}`, value === undefined || value === null ? "" : String(value));
  }
  return output;
}

function sanitizeOffer(offer) {
  return {
    id: offer.id,
    name: offer.name,
    type: offer.type,
    description: offer.description || "",
    couponCode: offer.couponCode || "",
    percentOff: offer.percentOff === null || offer.percentOff === undefined ? null : Number(offer.percentOff),
    amountOff: offer.amountOff === null || offer.amountOff === undefined ? null : Number(offer.amountOff),
    minOrderValue:
      offer.minOrderValue === null || offer.minOrderValue === undefined
        ? null
        : Number(offer.minOrderValue),
    customerType: offer.customerType || "",
    productIds: Array.isArray(offer.productIds) ? [...offer.productIds] : [],
    categoryIds: Array.isArray(offer.categoryIds) ? [...offer.categoryIds] : [],
    startsAt: offer.startsAt || null,
    endsAt: offer.endsAt || null,
    isActive: Boolean(offer.isActive),
    notes: offer.notes || "",
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt
  };
}

function sanitizeTemplate(template) {
  return {
    key: template.key,
    label: template.label,
    channel: template.channel || "email",
    subject: template.subject || "",
    body: template.body || "",
    variables: Array.isArray(template.variables) ? [...template.variables] : [],
    isActive: Boolean(template.isActive),
    updatedAt: template.updatedAt || null
  };
}

function sanitizeNotificationLog(log) {
  return {
    id: log.id,
    templateKey: log.templateKey,
    toEmail: log.toEmail || "",
    status: log.status,
    subject: log.subject || "",
    body: log.body || "",
    variables: log.variables || {},
    channel: log.channel || "email",
    relatedResourceType: log.relatedResourceType || "",
    relatedResourceId: log.relatedResourceId || "",
    createdAt: log.createdAt
  };
}

function sanitizeNotifySubscription(subscription) {
  return {
    id: subscription.id,
    productId: subscription.productId,
    productSlug: subscription.productSlug || "",
    productTitle: subscription.productTitle || "",
    customerId: subscription.customerId || "",
    customerName: subscription.customerName || "",
    email: subscription.email || "",
    mobile: subscription.mobile || "",
    status: subscription.status || "pending",
    sourcePage: subscription.sourcePage || "",
    requestedAt: subscription.requestedAt || subscription.createdAt || null,
    notifiedAt: subscription.notifiedAt || null,
    lastAttemptAt: subscription.lastAttemptAt || null,
    lastAttemptStatus: subscription.lastAttemptStatus || "",
    updatedAt: subscription.updatedAt || null
  };
}

module.exports = {
  OFFER_TYPES,
  TEMPLATE_KEYS,
  TEMPLATE_VARIABLES,
  NOTIFY_SUBSCRIPTION_STATUSES,
  createDefaultTemplate,
  cloneDefaultMarketingStore,
  ensureTemplateCoverage,
  fillTemplateText,
  sanitizeOffer,
  sanitizeTemplate,
  sanitizeNotificationLog,
  sanitizeNotifySubscription
};
