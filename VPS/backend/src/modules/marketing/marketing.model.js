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
  "order_placed_admin",
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
  "self_pickup_completed",
  "order_processing",
  "payment_pending",
  "otp_login_code_whatsapp",
  "forgot_password_whatsapp",
  "order_placed_whatsapp",
  "order_processing_whatsapp",
  "payment_pending_whatsapp",
  "manual_payment_verified_whatsapp",
  "tracking_detail_update_whatsapp",
  "review_approved",
  "review_approved_whatsapp",
  "review_rejected",
  "review_rejected_whatsapp",
  "cart_early_nudge_whatsapp"
]);

// The 7 customer lifecycle events the storefront actually fires today, each with
// a matching "<key>_whatsapp" companion — these are what the admin Notifications
// UI groups and shows first. Real, branded copy (not the generic boilerplate
// createDefaultTemplate() falls back to for every other, currently-unused key).
const LIFECYCLE_NOTIFICATION_EVENTS = Object.freeze([
  { key: "otp_login_code", whatsappKey: "otp_login_code_whatsapp", group: "Account", label: "Login OTP" },
  { key: "forgot_password", whatsappKey: "forgot_password_whatsapp", group: "Account", label: "Forgot Password" },
  { key: "order_placed", whatsappKey: "order_placed_whatsapp", group: "Order", label: "Order Placed" },
  { key: "order_processing", whatsappKey: "order_processing_whatsapp", group: "Order", label: "Order Processed" },
  { key: "payment_pending", whatsappKey: "payment_pending_whatsapp", group: "Payment", label: "Payment Pending" },
  { key: "manual_payment_verified", whatsappKey: "manual_payment_verified_whatsapp", group: "Payment", label: "Payment Confirmed" },
  { key: "tracking_detail_update", whatsappKey: "tracking_detail_update_whatsapp", group: "Shipping", label: "Order Shipped" },
  { key: "order_left_in_cart", whatsappKey: "order_left_in_cart_whatsapp", group: "Recovery", label: "Cart Left Behind" },
  { key: "review_approved", whatsappKey: "review_approved_whatsapp", group: "Reviews", label: "Review Approved" },
  { key: "review_rejected", whatsappKey: "review_rejected_whatsapp", group: "Reviews", label: "Review Rejected" }
]);

const BRAND_COLOR = "#E8231A";

function emailShell(bodyHtml) {
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;">`,
    `<div style="background:${BRAND_COLOR};padding:18px 24px;border-radius:10px 10px 0 0;">`,
    `<span style="color:#fff;font-size:18px;font-weight:700;">{{businessName}}</span>`,
    `</div>`,
    `<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:24px;">`,
    bodyHtml,
    `<p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">Need help? Call or WhatsApp us at {{supportPhone}}.</p>`,
    `</div>`,
    `</div>`
  ].join("");
}

const SPECIAL_TEMPLATE_CONTENT = Object.freeze({
  otp_login_code: {
    label: "Login OTP (Email)",
    subject: "{{otpCode}} is your {{businessName}} login code",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">Use this code to log in to your account:</p>` +
      `<div style="background:#f9fafb;border:1.5px dashed ${BRAND_COLOR};border-radius:8px;padding:16px;text-align:center;margin:16px 0;">` +
      `<span style="font-size:28px;font-weight:800;letter-spacing:6px;color:${BRAND_COLOR};">{{otpCode}}</span></div>` +
      `<p style="font-size:13px;color:#6b7280;">This code expires shortly. If you didn't request this, you can safely ignore this email.</p>`
    )
  },
  otp_login_code_whatsapp: {
    label: "Login OTP (WhatsApp)",
    subject: "",
    body: "Your {{businessName}} login code is *{{otpCode}}*. Do not share this with anyone. It expires shortly."
  },
  forgot_password: {
    label: "Forgot Password (Email)",
    subject: "Reset your {{businessName}} password",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">We received a request to reset your password. Click below to set a new one:</p>` +
      `<div style="text-align:center;margin:20px 0;"><a href="{{resetPasswordUrl}}" style="background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px;display:inline-block;">Reset Password</a></div>` +
      `<p style="font-size:13px;color:#6b7280;">If you didn't request this, you can safely ignore this email — your password won't be changed.</p>`
    )
  },
  forgot_password_whatsapp: {
    label: "Forgot Password (WhatsApp)",
    subject: "",
    body: "Hi {{customerName}}, reset your {{businessName}} password here: {{resetPasswordUrl}}\nDidn't request this? You can ignore this message."
  },
  order_placed: {
    label: "Order Placed (Email)",
    subject: "Order {{orderNo}} confirmed — thank you!",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">Thanks for shopping with us! Your order has been placed successfully.</p>` +
      `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0;">` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Order No.</td><td style="padding:6px 0;text-align:right;font-weight:700;">{{orderNo}}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Payment Method</td><td style="padding:6px 0;text-align:right;">{{paymentMethod}}</td></tr>` +
      `</table>` +
      `{{itemsTable}}` +
      `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:4px 0 16px;">` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Order Total</td><td style="padding:6px 0;text-align:right;font-weight:700;">{{orderTotal}}</td></tr>` +
      `</table>` +
      `<p style="font-size:13px;color:#6b7280;">We'll notify you again once your order is packed and shipped. You can track everything from your account.</p>`
    )
  },
  order_placed_whatsapp: {
    label: "Order Placed (WhatsApp)",
    subject: "",
    body: "🎉 Order confirmed! Hi {{customerName}}, your order *{{orderNo}}* ({{orderTotal}}) has been placed with {{businessName}}. We'll message you again once it ships. Thank you for shopping with us!"
  },
  order_placed_admin: {
    label: "New Order Alert (Admin Email)",
    subject: "New order {{orderNo}} — {{orderTotal}}",
    body: emailShell(
      `<p style="font-size:14px;">A new order was just placed on {{businessName}}.</p>` +
      `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0;">` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Order No.</td><td style="padding:6px 0;text-align:right;font-weight:700;">{{orderNo}}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Customer</td><td style="padding:6px 0;text-align:right;">{{customerName}}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;text-align:right;">{{customerEmail}}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Mobile</td><td style="padding:6px 0;text-align:right;">{{customerMobile}}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Payment Method</td><td style="padding:6px 0;text-align:right;">{{paymentMethod}}</td></tr>` +
      `</table>` +
      `{{itemsTable}}` +
      `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:4px 0 16px;">` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Order Total</td><td style="padding:6px 0;text-align:right;font-weight:700;">{{orderTotal}}</td></tr>` +
      `</table>` +
      `<p style="font-size:13px;color:#6b7280;">Open the admin panel to view full order and shipping details.</p>`
    )
  },
  order_processing: {
    label: "Order Processed (Email)",
    subject: "Your order {{orderNo}} is being processed",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">Good news — we've started processing your order <strong>{{orderNo}}</strong>. Our team is picking and packing your items now.</p>` +
      `<p style="font-size:13px;color:#6b7280;">We'll send you tracking details as soon as it's handed over to the courier.</p>`
    )
  },
  order_processing_whatsapp: {
    label: "Order Processed (WhatsApp)",
    subject: "",
    body: "📦 Hi {{customerName}}, your order *{{orderNo}}* is now being processed and packed. We'll send tracking details once it ships!"
  },
  payment_pending: {
    label: "Payment Pending (Email)",
    subject: "Action needed — complete payment for order {{orderNo}}",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">Your order <strong>{{orderNo}}</strong> for <strong>{{orderTotal}}</strong> is saved and waiting for payment via {{paymentMethod}}.</p>` +
      `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:13px;">{{paymentInstructions}}</div>` +
      `<p style="font-size:13px;color:#6b7280;">Once we receive and verify your payment, we'll begin processing your order right away.</p>`
    )
  },
  payment_pending_whatsapp: {
    label: "Payment Pending (WhatsApp)",
    subject: "",
    body: "⏳ Hi {{customerName}}, your order *{{orderNo}}* ({{orderTotal}}) is waiting for payment via {{paymentMethod}}.\n{{paymentInstructions}}\nWe'll process your order as soon as payment is confirmed."
  },
  manual_payment_verified: {
    label: "Payment Confirmed (Email)",
    subject: "Payment received for order {{orderNo}} ✅",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">We've confirmed your payment of <strong>{{orderTotal}}</strong> for order <strong>{{orderNo}}</strong>. Thank you!</p>` +
      `<p style="font-size:14px;">Your order is now being processed and will ship soon.</p>` +
      `<p style="font-size:13px;color:#6b7280;">Invoice: {{invoiceNo}}</p>`
    )
  },
  manual_payment_verified_whatsapp: {
    label: "Payment Confirmed (WhatsApp)",
    subject: "",
    body: "✅ Payment received! Hi {{customerName}}, we've confirmed your payment of {{orderTotal}} for order *{{orderNo}}*. It's now being processed. Thank you!"
  },
  review_approved: {
    label: "Review Approved (Email)",
    subject: "Your review for {{productName}} is now live ⭐",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">Thanks for taking the time to review <strong>{{productName}}</strong> — it's now live on the product page.</p>` +
      `<p style="font-size:14px;">We appreciate you helping other buyers make better decisions!</p>`
    )
  },
  review_approved_whatsapp: {
    label: "Review Approved (WhatsApp)",
    subject: "",
    body: "⭐ Hi {{customerName}}, your review for *{{productName}}* is now live. Thanks for sharing your feedback!"
  },
  review_rejected: {
    label: "Review Not Approved (Email)",
    subject: "About your review for {{productName}}",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">Your review for <strong>{{productName}}</strong> couldn't be published.</p>` +
      `<p style="font-size:13px;color:#6b7280;">Reason: {{rejectionReason}}</p>` +
      `<p style="font-size:14px;">Feel free to submit an updated review any time.</p>`
    )
  },
  review_rejected_whatsapp: {
    label: "Review Not Approved (WhatsApp)",
    subject: "",
    body: "Hi {{customerName}}, your review for *{{productName}}* couldn't be published ({{rejectionReason}}). Feel free to submit an updated one."
  },
  tracking_detail_update: {
    label: "Order Shipped (Email)",
    subject: "Your order {{orderNo}} has shipped 🚚",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">Your order <strong>{{orderNo}}</strong> is on its way!</p>` +
      `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0;">` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Courier</td><td style="padding:6px 0;text-align:right;font-weight:700;">{{courierName}}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Tracking ID</td><td style="padding:6px 0;text-align:right;font-weight:700;">{{trackingId}}</td></tr>` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Expected Delivery</td><td style="padding:6px 0;text-align:right;">{{expectedDeliveryDate}}</td></tr>` +
      `</table>` +
      `<div style="text-align:center;margin:20px 0;"><a href="{{trackingUrl}}" style="background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px;display:inline-block;">Track Your Order</a></div>`
    )
  },
  tracking_detail_update_whatsapp: {
    label: "Order Shipped (WhatsApp)",
    subject: "",
    body: "🚚 Shipped! Hi {{customerName}}, order *{{orderNo}}* is on its way via {{courierName}}.\nTracking ID: {{trackingId}}\nTrack here: {{trackingUrl}}"
  },
  order_left_in_cart: {
    label: "Cart Left Behind (Email)",
    subject: "You left something in your cart — {{businessName}}",
    body: emailShell(
      `<p style="font-size:14px;">Hi {{customerName}},</p>` +
      `<p style="font-size:14px;">Your cart is still saved — pick up right where you left off:</p>` +
      `{{itemsTable}}` +
      `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:4px 0 16px;">` +
      `<tr><td style="padding:6px 0;color:#6b7280;">Cart Total</td><td style="padding:6px 0;text-align:right;font-weight:700;">{{orderTotal}}</td></tr>` +
      `</table>` +
      `<div style="text-align:center;margin:20px 0;"><a href="{{recoveryUrl}}" style="background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px;display:inline-block;">Continue My Order →</a></div>` +
      (
        `<div style="display:flex;align-items:center;gap:10px;border:1px solid #e5e7eb;border-radius:10px;padding:11px 13px;background:#f0fdf4;margin-bottom:6px;">` +
        `<a href="{{whatsappLink}}" style="text-decoration:none;display:flex;align-items:center;gap:10px;width:100%;">` +
        `<span style="width:32px;height:32px;border-radius:50%;background:#25d366;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;font-size:16px;">&#9743;</span>` +
        `<span><span style="display:block;font-size:12.5px;font-weight:700;color:#1f2937;">Need help finishing your order?</span>` +
        `<span style="display:block;font-size:12px;color:#15803d;font-weight:600;">Tap to WhatsApp us · {{whatsappNumber}}</span></span>` +
        `</a></div>`
      ) +
      `<p style="font-size:12px;color:#9ca3af;margin-top:14px;">This cart is held for you, not the stock — items may sell out.</p>`
    )
  },
  order_left_in_cart_whatsapp: {
    label: "Cart Left Behind (WhatsApp)",
    subject: "",
    body: "Hi {{customerName}}, you left items worth {{orderTotal}} in your cart at {{businessName}}. Continue here: {{recoveryUrl}}"
  },
  // Fires ~8-45 min after cart activity (see abandoned-cart.service.js
  // dispatchEarlyWhatsappNudges) — a fast, casual first touch while the
  // buyer is likely still in a browsing mindset, separate from the slower
  // 30min/6hr/24hr order_left_in_cart schedule which is email-first.
  cart_early_nudge_whatsapp: {
    label: "Early Cart Nudge (WhatsApp)",
    subject: "",
    body: "Hi {{customerName}}, still deciding? Your cart worth {{orderTotal}} at {{businessName}} is saved and waiting — {{recoveryUrl}}. Reply here if you have any questions, happy to help: {{whatsappNumber}}"
  }
});

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
  "itemsTable",
  "customerEmail",
  "customerMobile",
  "invoiceDownloadUrl",
  "supportPhone",
  "businessName",
  "refundAmount",
  "productName",
  "pickupLocation",
  "pickupInstructions",
  "otpCode",
  "orderTotal",
  "paymentMethod",
  "paymentInstructions",
  "expectedDeliveryDate",
  "recoveryUrl",
  "whatsappNumber",
  "whatsappLink",
  "rejectionReason"
]);

const NOTIFY_SUBSCRIPTION_STATUSES = Object.freeze([
  "pending",
  "notified",
  "cancelled"
]);

function createDefaultTemplate(key) {
  const special = SPECIAL_TEMPLATE_CONTENT[key];
  if (special) {
    return {
      key,
      channel: key.endsWith("_whatsapp") ? "whatsapp" : "email",
      label: special.label,
      subject: special.subject,
      body: special.body,
      variables: [...TEMPLATE_VARIABLES],
      isActive: true,
      updatedAt: null
    };
  }

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
    if (!byKey.has(key)) {
      rows.push(createDefaultTemplate(key));
      changed = true;
      continue;
    }

    // A row already exists for this key (e.g. seeded before this key had real
    // content). Only refresh it if no admin has ever saved a customization
    // (updatedAt === null) and it's still the old boilerplate — never
    // overwrite a deliberate admin edit.
    const special = SPECIAL_TEMPLATE_CONTENT[key];
    const existing = byKey.get(key);
    if (special && existing.updatedAt === null && existing.subject !== special.subject) {
      const index = rows.findIndex((row) => row.key === key);
      rows[index] = createDefaultTemplate(key);
      changed = true;
    }
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
    toMobile: log.toMobile || "",
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
  LIFECYCLE_NOTIFICATION_EVENTS,
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
