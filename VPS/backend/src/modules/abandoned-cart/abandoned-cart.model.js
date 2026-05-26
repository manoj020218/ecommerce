const RECOVERY_STAGES = Object.freeze({
  ACTIVE: "active",
  CART_ADDED: "cart_added",
  CHECKOUT_STARTED: "checkout_started",
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_FAILED: "payment_failed",
  ABANDONED: "abandoned",
  RECOVERED: "recovered",
  EXPIRED: "expired"
});

const RECOVERY_FEEDBACK_REASONS = Object.freeze([
  "payment problem",
  "need GST invoice",
  "need installation support",
  "confused about product",
  "need bulk price",
  "want WhatsApp/call support",
  "only checking price"
]);

const REMINDER_SCHEDULE_MINUTES = Object.freeze([30, 360, 1440]);

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeRecoveryCartItem(item) {
  return {
    productId: item.productId,
    title: item.title || "",
    slug: item.slug || "",
    sku: item.sku || "",
    qty: Number(item.qty || 0),
    unitPrice: Number(
      item.finalUnitPriceAfterDiscount || item.unitPrice || item.finalUnitPrice || 0
    ),
    lineTotal: Number(item.lineTotal || 0),
    gstRate: Number(item.gstRate || 0),
    availabilityStatus: item.availabilityStatus || "unknown"
  };
}

function sanitizeReminder(reminder) {
  return {
    id: reminder.id,
    reminderNumber: Number(reminder.reminderNumber || 0),
    offsetMinutes: Number(reminder.offsetMinutes || 0),
    scheduledAt: reminder.scheduledAt || null,
    sentAt: reminder.sentAt || null,
    channel: reminder.channel || "",
    target: reminder.target || "",
    recoveryUrl: reminder.recoveryUrl || "",
    messagePreview: reminder.messagePreview || ""
  };
}

function sanitizeRecoverySummary(record) {
  return {
    id: record.id,
    ownerType: record.ownerType || "guest",
    ownerId: record.ownerId || "",
    userId: record.userId || null,
    sessionId: record.sessionId || null,
    customerName: record.customerName || "",
    email: record.email || "",
    mobile: record.mobile || "",
    stage: record.stage || RECOVERY_STAGES.ACTIVE,
    cartItemCount: Number(record.cartItemCount || 0),
    cartValue: Number(record.cartValue || 0),
    paymentAttemptId: record.paymentAttemptId || "",
    gatewayOrderId: record.gatewayOrderId || "",
    failureReason: record.failureReason || "",
    reminderCount: Number(record.reminderCount || 0),
    nextReminderAt: record.nextReminderAt || null,
    lastActivityAt: record.lastActivityAt || null,
    checkoutSessionId: record.checkoutSessionId || null,
    recoveryToken: record.recoveryToken || "",
    recoveryUrl: record.recoveryUrl || "",
    feedbackReason: record.feedbackReason || "",
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
}

function sanitizeRecoveryDetail(record) {
  return {
    ...sanitizeRecoverySummary(record),
    cartItems: ensureArray(record.cartItems).map(sanitizeRecoveryCartItem),
    reminders: ensureArray(record.reminders).map(sanitizeReminder),
    billingAddress: record.billingAddress || {},
    shippingAddress: record.shippingAddress || {},
    paymentMethod: record.paymentMethod || "",
    shippingMethod: record.shippingMethod || "",
    restoredAt: record.restoredAt || null,
    recoveredAt: record.recoveredAt || null,
    recoveredOrderId: record.recoveredOrderId || null,
    expiredAt: record.expiredAt || null,
    feedbackNote: record.feedbackNote || ""
  };
}

module.exports = {
  RECOVERY_STAGES,
  RECOVERY_FEEDBACK_REASONS,
  REMINDER_SCHEDULE_MINUTES,
  ensureArray,
  sanitizeRecoveryCartItem,
  sanitizeReminder,
  sanitizeRecoverySummary,
  sanitizeRecoveryDetail
};
