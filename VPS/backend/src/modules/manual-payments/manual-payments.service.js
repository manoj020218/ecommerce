const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { env } = require("../../config/env");
const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { readPaymentStore, writePaymentStore } = require("../../database/payment-store");
const { calculateAvailableQty } = require("../products/products.model");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  CART_OWNER_TYPES,
  PAYMENT_ATTEMPT_STATUSES,
  PAYMENT_METHODS,
  CHECKOUT_STATUSES,
  SHIPPING_METHODS
} = require("../cart-checkout/cart-checkout.model");
const {
  B2B_ORDER_STATUSES
} = require("../customers/customers.model");
const {
  ensurePaymentStoreShape
} = require("../payment-gateways/payment-gateways.service");
const { ensureInvoiceForOrder } = require("../invoices/invoices.service");
const {
  trackPaymentFailed,
  trackRecoveryCompleted
} = require("../abandoned-cart/abandoned-cart.service");
const {
  safeSendTemplateNotification,
  notifyCustomerEvent
} = require("../marketing/marketing.service");
const {
  MANUAL_PAYMENT_STATUSES,
  sanitizeManualPaymentSubmission
} = require("./manual-payments.model");
const {
  sendPaymentScreenshotReminder
} = require("../../common/upi-payment-kit/whatsapp-reminder");
const whatsappService = require("../whatsapp/whatsapp.service");

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureAuthStoreShape(store) {
  if (!Array.isArray(store.orders)) {
    store.orders = [];
  }
  if (!Array.isArray(store.checkoutSessions)) {
    store.checkoutSessions = [];
  }
  if (!Array.isArray(store.paymentAttempts)) {
    store.paymentAttempts = [];
  }
  if (!Array.isArray(store.guestCarts)) {
    store.guestCarts = [];
  }
  if (!Array.isArray(store.userCarts)) {
    store.userCarts = [];
  }
}

function buildPublicUploadUrl(fullFilePath) {
  const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);
  const relativePath = path.relative(uploadsRoot, fullFilePath).replace(/\\/g, "/");
  return `${env.publicBaseUrl}/static/uploads/${relativePath}`;
}

function findOrderByIdOrNo(authStore, orderId) {
  return ensureArray(authStore.orders).find(
    (order) => order.id === orderId || order.orderNo === orderId
  );
}

function findCheckoutSessionById(authStore, checkoutSessionId) {
  return ensureArray(authStore.checkoutSessions).find(
    (session) => session.id === checkoutSessionId
  );
}

function resolveContextOwner(context) {
  if (context.customerId) {
    return {
      ownerType: CART_OWNER_TYPES.CUSTOMER,
      ownerId: context.customerId
    };
  }
  if (context.sessionId) {
    return {
      ownerType: CART_OWNER_TYPES.GUEST,
      ownerId: context.sessionId
    };
  }
  throw new HttpError(
    400,
    "Customer login or guest sessionId is required for manual payment submission."
  );
}

function assertOrderOwnership(order, session, contextOwner) {
  if (!order || !session) {
    throw new HttpError(404, "Order not found.");
  }

  if (
    session.ownerType !== contextOwner.ownerType ||
    session.ownerId !== contextOwner.ownerId
  ) {
    throw new HttpError(403, "You are not allowed to submit payment for this order.");
  }
}

function mapOrderSummary(order) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    invoiceId: order.invoiceId || null,
    invoiceNumber: order.invoiceNumber || "",
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    grandTotal: Number(order.grandTotal || 0),
    manualPaymentStatus: order.manualPaymentStatus || "",
    createdAt: order.createdAt || null
  };
}

function resolveNotificationEmail(order) {
  const shippingEmail = String(order?.shippingAddress?.email || "")
    .trim()
    .toLowerCase();
  if (shippingEmail) {
    return shippingEmail;
  }

  return String(order?.billingAddress?.email || "")
    .trim()
    .toLowerCase();
}

function resolveNotificationMobile(order) {
  return String(
    order?.shippingAddress?.mobile || order?.billingAddress?.mobile || ""
  ).trim();
}

function resolveNotificationCustomerName(order) {
  return (
    order?.billingAddress?.companyName ||
    order?.billingAddress?.name ||
    order?.shippingAddress?.companyName ||
    order?.shippingAddress?.name ||
    "Customer"
  );
}

function formatOrderItems(order) {
  return ensureArray(order?.items)
    .map((item) => `${item.title || item.productId} x${Number(item.qty || 0)}`)
    .join(", ");
}

function resolveStockStatus(product) {
  const availableQty = calculateAvailableQty(product);
  const lowStockThreshold = Number(product.lowStockThreshold || 0);

  if (availableQty <= 0) {
    return product.allowBackorder ? "backorder" : "out_of_stock";
  }
  if (availableQty <= lowStockThreshold) {
    return "low_stock";
  }
  return "in_stock";
}

function consumeStockForOrder(order, catalogStore) {
  for (const item of ensureArray(order.items)) {
    const productIndex = ensureArray(catalogStore.products).findIndex(
      (product) => product.id === item.productId
    );
    if (productIndex < 0) {
      throw new HttpError(409, `Product '${item.productId}' not found for stock deduction.`);
    }

    const product = catalogStore.products[productIndex];
    const qty = Number(item.qty || 0);
    const availableQty = Number(product.stockQty || 0) - Number(product.reservedQty || 0);
    if (!product.allowBackorder && qty > availableQty) {
      throw new HttpError(409, `Insufficient stock for '${product.title}'.`);
    }
  }

  for (const item of ensureArray(order.items)) {
    const productIndex = ensureArray(catalogStore.products).findIndex(
      (product) => product.id === item.productId
    );
    const product = catalogStore.products[productIndex];
    const qty = Number(item.qty || 0);
    const nextStockQty = Math.max(0, Number(product.stockQty || 0) - qty);

    catalogStore.products[productIndex] = {
      ...product,
      stockQty: nextStockQty,
      stockStatus: resolveStockStatus({
        ...product,
        stockQty: nextStockQty
      }),
      updatedAt: nowIso()
    };
  }
}

async function submitManualPayment(context, payload, fullFilePath) {
  const contextOwner = resolveContextOwner(context);
  const [authStore, paymentStore] = await Promise.all([readAuthStore(), readPaymentStore()]);
  ensureAuthStoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);

  const order = findOrderByIdOrNo(authStore, payload.orderId);
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }

  const checkoutSession = findCheckoutSessionById(authStore, order.checkoutSessionId);
  assertOrderOwnership(order, checkoutSession, contextOwner);

  if (
    ![PAYMENT_METHODS.DIRECT_BANK_TRANSFER, PAYMENT_METHODS.MANUAL_UPI].includes(
      order.paymentMethod
    )
  ) {
    throw new HttpError(409, "Manual payment submission is not allowed for this order.");
  }

  if (payload.paymentMethod && payload.paymentMethod !== order.paymentMethod) {
    throw new HttpError(409, "Submitted payment method does not match order payment method.");
  }

  if (String(order.paymentStatus || "").toLowerCase() === "paid") {
    throw new HttpError(409, "Order is already paid.");
  }

  if (
    order.isB2BOrderRequest &&
    order.orderStatus !== B2B_ORDER_STATUSES.AWAITING_BANK_PAYMENT
  ) {
    throw new HttpError(
      409,
      "Payment proof can be submitted only after admin approval for this order request."
    );
  }

  const screenshotUrl = buildPublicUploadUrl(fullFilePath);
  const submission = {
    id: generateId("manual_pay"),
    orderId: order.id,
    orderNo: order.orderNo || "",
    checkoutSessionId: order.checkoutSessionId || null,
    paymentMethod: payload.paymentMethod || order.paymentMethod,
    utrNumber: payload.utrNumber,
    screenshotUrl,
    note: payload.note || "",
    status: MANUAL_PAYMENT_STATUSES.PENDING_VERIFICATION,
    submittedAt: nowIso(),
    submittedBy: `${contextOwner.ownerType}:${contextOwner.ownerId}`,
    verifiedAt: null,
    verifiedBy: null,
    verificationNote: "",
    rejectionReason: ""
  };

  paymentStore.manualPaymentSubmissions.push(submission);
  order.manualPaymentStatus = "submitted";
  order.manualPaymentSubmittedAt = submission.submittedAt;
  order.updatedAt = submission.submittedAt;

  await Promise.all([writeAuthStore(authStore), writePaymentStore(paymentStore)]);

  await addActivityLog({
    action: "manual_payment.submitted",
    actorId: contextOwner.ownerId,
    actorRole: contextOwner.ownerType,
    resourceType: "manual_payment_submission",
    resourceId: submission.id,
    metadata: {
      orderId: order.id
    }
  });
  await safeSendTemplateNotification({
    templateKey: "manual_payment_submitted",
    toEmail: resolveNotificationEmail(order),
    relatedResourceType: "order",
    relatedResourceId: order.id,
    variables: {
      customerName: resolveNotificationCustomerName(order),
      orderNo: order.orderNo || "",
      cartItems: formatOrderItems(order)
    }
  });

  return {
    submission: sanitizeManualPaymentSubmission(submission),
    order: mapOrderSummary(order)
  };
}

async function listManualPaymentSubmissions(filters) {
  const [authStore, paymentStore] = await Promise.all([readAuthStore(), readPaymentStore()]);
  ensureAuthStoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);

  let submissions = ensureArray(paymentStore.manualPaymentSubmissions);
  if (filters.status) {
    submissions = submissions.filter((row) => row.status === filters.status);
  }
  if (filters.orderId) {
    submissions = submissions.filter((row) => row.orderId === filters.orderId);
  }

  submissions = submissions
    .sort((a, b) => Date.parse(b.submittedAt || "") - Date.parse(a.submittedAt || ""))
    .slice(0, Number(filters.limit || 100));

  return submissions.map((submission) => {
    const order = findOrderByIdOrNo(authStore, submission.orderId);
    return {
      ...sanitizeManualPaymentSubmission(submission),
      order: order ? mapOrderSummary(order) : null
    };
  });
}

async function verifyManualPaymentSubmission(submissionId, payload, actor) {
  const [authStore, catalogStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readPaymentStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);

  const submission = ensureArray(paymentStore.manualPaymentSubmissions).find(
    (row) => row.id === submissionId
  );
  if (!submission) {
    throw new HttpError(404, "Manual payment submission not found.");
  }

  const order = findOrderByIdOrNo(authStore, submission.orderId);
  if (!order) {
    throw new HttpError(404, "Order not found for manual payment submission.");
  }
  const checkoutSession = findCheckoutSessionById(authStore, order.checkoutSessionId);

  if (payload.action === "reject") {
    submission.status = MANUAL_PAYMENT_STATUSES.REJECTED;
    submission.rejectionReason = payload.rejectionReason || "payment_rejected";
    submission.verificationNote = payload.verificationNote || "";
    submission.verifiedAt = nowIso();
    submission.verifiedBy = actor.id;
    order.manualPaymentStatus = "rejected";
    order.updatedAt = nowIso();

    await Promise.all([writeAuthStore(authStore), writePaymentStore(paymentStore)]);

    if (checkoutSession) {
      await trackPaymentFailed(
        {
          ownerType: checkoutSession.ownerType,
          ownerId: checkoutSession.ownerId
        },
        checkoutSession,
        null,
        submission.rejectionReason
      );
    }
    await safeSendTemplateNotification({
      templateKey: "payment_failed",
      toEmail: resolveNotificationEmail(order),
      relatedResourceType: "order",
      relatedResourceId: order.id,
      variables: {
        customerName: resolveNotificationCustomerName(order),
        orderNo: order.orderNo || "",
        cartItems: formatOrderItems(order)
      }
    });

    await addActivityLog({
      action: "manual_payment.rejected",
      actorId: actor.id,
      actorRole: actor.role,
      resourceType: "manual_payment_submission",
      resourceId: submission.id
    });

    return {
      submission: sanitizeManualPaymentSubmission(submission),
      order: mapOrderSummary(order)
    };
  }

  if (submission.status !== MANUAL_PAYMENT_STATUSES.VERIFIED) {
    submission.status = MANUAL_PAYMENT_STATUSES.VERIFIED;
    submission.verificationNote = payload.verificationNote || "";
    submission.rejectionReason = "";
    submission.verifiedAt = nowIso();
    submission.verifiedBy = actor.id;
  }

  if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
    consumeStockForOrder(order, catalogStore);
    order.paymentStatus = "paid";
    order.orderStatus = order.isB2BOrderRequest
      ? B2B_ORDER_STATUSES.PAYMENT_RECEIVED
      : "placed";
    order.manualPaymentStatus = "verified";
    order.paymentVerifiedAt = nowIso();
    order.gatewayTxnId = payload.gatewayTxnId || submission.utrNumber;
    order.updatedAt = nowIso();

    authStore.paymentAttempts.push({
      id: generateId("pay_attempt"),
      checkoutSessionId: order.checkoutSessionId || "",
      ownerType: checkoutSession?.ownerType || CART_OWNER_TYPES.GUEST,
      ownerId: checkoutSession?.ownerId || "",
      gateway: order.paymentMethod,
      status: PAYMENT_ATTEMPT_STATUSES.SUCCESS,
      amount: Number(order.grandTotal || 0),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      gatewayTxnId: order.gatewayTxnId,
      failureReason: ""
    });
  }

  if (checkoutSession) {
    checkoutSession.status = CHECKOUT_STATUSES.PAID;
    checkoutSession.updatedAt = nowIso();
  }

  await Promise.all([
    writeAuthStore(authStore),
    writeCatalogStore(catalogStore),
    writePaymentStore(paymentStore)
  ]);

  if (checkoutSession) {
    await trackRecoveryCompleted(
      {
        ownerType: checkoutSession.ownerType,
        ownerId: checkoutSession.ownerId
      },
      checkoutSession.id,
      order.id
    );
  }

  const invoiceResult = await ensureInvoiceForOrder(order.id, actor, {
    source: "manual_payment_verification"
  });
  // Only the "payment confirmed" notification fires here — the customer already
  // got a "payment pending" message with instructions when this order was first
  // created (cart-checkout.service.js), so re-sending order_placed on top of this
  // would be a duplicate email/WhatsApp for the same order.
  await notifyCustomerEvent({
    eventKey: "manual_payment_verified",
    toEmail: resolveNotificationEmail(order),
    toMobile: resolveNotificationMobile(order),
    invoiceId: invoiceResult.invoice?.id || order.invoiceId || null,
    relatedResourceType: "order",
    relatedResourceId: order.id,
    variables: {
      customerName: resolveNotificationCustomerName(order),
      orderNo: order.orderNo || "",
      invoiceNo: invoiceResult.invoice?.invoiceNumber || order.invoiceNumber || "",
      orderTotal: `₹${Number(order.grandTotal || 0).toLocaleString("en-IN")}`
    }
  });

  await addActivityLog({
    action: "manual_payment.verified",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "manual_payment_submission",
    resourceId: submission.id,
    metadata: {
      orderId: order.id
    }
  });

  return {
    submission: sanitizeManualPaymentSubmission(submission),
    order: mapOrderSummary(order),
    invoice: invoiceResult.invoice
  };
}

async function getPublicGatewayInfo(paymentMethod) {
  const paymentStore = await readPaymentStore();
  const safeStore = ensurePaymentStoreShape(paymentStore);
  const normalizedMethod = String(paymentMethod || "").trim().toLowerCase();
  const gateway = (safeStore.gateways || []).find(
    (row) => String(row.code || "").trim().toLowerCase() === normalizedMethod
  );
  if (!gateway) {
    return null;
  }
  return {
    gatewayCode: gateway.code,
    gatewayLabel: gateway.label,
    instructions: gateway.instructions || {}
  };
}

// Fires a WhatsApp nudge to the buyer's own mobile number reminding them to
// upload the payment screenshot — for desktop checkouts, where the
// screenshot is usually sitting on their phone, not the computer they're
// checking out on. Uses the portable upi-payment-kit reminder helper,
// wired here to this project's existing Baileys-based WhatsApp session
// (whatsapp.service.js) — that's the only jenix-specific part.
async function requestPaymentScreenshotReminder(orderId) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);

  const order = findOrderByIdOrNo(authStore, orderId);
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  if (order.paymentStatus === "paid") {
    return { sent: false, reason: "already_paid" };
  }
  if (order.whatsappReminderSentAt) {
    return { sent: false, reason: "already_sent" };
  }

  const contact = order.billingAddress || order.shippingAddress || {};
  const result = await sendPaymentScreenshotReminder({
    sendMessage: (mobile, text) => whatsappService.sendMessage(mobile, text),
    mobile: contact.mobile || "",
    customerName: contact.name || contact.companyName || "",
    orderNo: order.orderNo || "",
    amount: order.grandTotal
  });

  if (result.sent) {
    order.whatsappReminderSentAt = nowIso();
    await writeAuthStore(authStore);
    await addActivityLog({
      action: "manual_payment.whatsapp_reminder_sent",
      resourceType: "order",
      resourceId: order.id
    });
  }

  return result;
}

module.exports = {
  submitManualPayment,
  listManualPaymentSubmissions,
  verifyManualPaymentSubmission,
  getPublicGatewayInfo,
  requestPaymentScreenshotReminder
};
