const crypto = require("node:crypto");
const { HttpError } = require("../../common/http-error");
const { env } = require("../../config/env");
const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const {
  readRecoveryStore,
  writeRecoveryStore
} = require("../../database/recovery-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { getPublicSettingsBundle } = require("../settings/settings.service");
const {
  CART_OWNER_TYPES
} = require("../cart-checkout/cart-checkout.model");
const {
  RECOVERY_FEEDBACK_REASONS,
  RECOVERY_STAGES,
  REMINDER_SCHEDULE_MINUTES,
  ensureArray,
  sanitizeRecoveryDetail,
  sanitizeRecoverySummary
} = require("./abandoned-cart.model");

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeMobile(value) {
  return String(value || "").trim();
}

function ensureRecoveryStoreShape(store) {
  if (!Array.isArray(store.recoveries)) {
    store.recoveries = [];
  }
}

function ensureAuthStoreShape(store) {
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
  if (!Array.isArray(store.guestCarts)) {
    store.guestCarts = [];
  }
  if (!Array.isArray(store.userCarts)) {
    store.userCarts = [];
  }
}

function isClosedStage(stage) {
  return [RECOVERY_STAGES.RECOVERED, RECOVERY_STAGES.EXPIRED].includes(stage);
}

function parseDateOrNull(value) {
  const timestamp = Date.parse(value || "");
  return Number.isNaN(timestamp) ? null : timestamp;
}

function addMinutes(isoString, minutes) {
  const baseTimestamp = parseDateOrNull(isoString) || Date.now();
  return new Date(baseTimestamp + Number(minutes || 0) * 60 * 1000).toISOString();
}

function buildRecoveryUrl(token) {
  return `${env.publicBaseUrl}/recover/${token}`;
}

function resolveCustomerProfile(authStore, owner) {
  if (owner.ownerType !== CART_OWNER_TYPES.CUSTOMER) {
    return null;
  }

  return ensureArray(authStore.users).find((row) => row.id === owner.ownerId) || null;
}

function summarizeCartView(cartView) {
  const items = ensureArray(cartView?.items).map((item) => ({
    productId: item.productId,
    title: item.title || "",
    slug: item.slug || "",
    sku: item.sku || "",
    qty: Number(item.qty || 0),
    finalUnitPrice: Number(
      item.finalUnitPriceAfterDiscount || item.unitPrice || item.finalUnitPrice || 0
    ),
    unitPrice: Number(item.unitPrice || 0),
    lineTotal: Number(item.lineTotal || 0),
    gstRate: Number(item.gstRate || 0),
    availabilityStatus: item.availabilityStatus || "unknown"
  }));

  return {
    cartItems: items,
    cartItemCount: items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    cartValue: Number(
      cartView?.pricing?.grandTotal || cartView?.pricing?.productSubtotal || 0
    )
  };
}

function resolveContactSnapshot(authStore, owner, options = {}, existing = null) {
  const billingAddress = options.billingAddress || {};
  const shippingAddress = options.shippingAddress || {};
  const customer = resolveCustomerProfile(authStore, owner);

  return {
    customerName:
      billingAddress.name ||
      shippingAddress.name ||
      customer?.name ||
      existing?.customerName ||
      "",
    email:
      normalizeEmail(
        billingAddress.email ||
          shippingAddress.email ||
          customer?.email ||
          existing?.email ||
          ""
      ),
    mobile:
      normalizeMobile(
        billingAddress.mobile ||
          shippingAddress.mobile ||
          customer?.mobile ||
          existing?.mobile ||
          ""
      )
  };
}

function sortNewestFirst(records) {
  return [...records].sort((left, right) => {
    const leftTimestamp =
      parseDateOrNull(left.updatedAt) || parseDateOrNull(left.createdAt) || 0;
    const rightTimestamp =
      parseDateOrNull(right.updatedAt) || parseDateOrNull(right.createdAt) || 0;
    return rightTimestamp - leftTimestamp;
  });
}

function findOpenRecoveryByOwner(recoveryStore, owner) {
  return sortNewestFirst(
    ensureArray(recoveryStore.recoveries).filter(
      (row) =>
        row.ownerType === owner.ownerType &&
        row.ownerId === owner.ownerId &&
        !isClosedStage(row.stage)
    )
  )[0] || null;
}

function findRecoveryByCheckoutSessionId(recoveryStore, checkoutSessionId) {
  return sortNewestFirst(
    ensureArray(recoveryStore.recoveries).filter(
      (row) => row.checkoutSessionId && row.checkoutSessionId === checkoutSessionId
    )
  )[0] || null;
}

function findRecoveryByPaymentAttemptId(recoveryStore, paymentAttemptId) {
  return sortNewestFirst(
    ensureArray(recoveryStore.recoveries).filter(
      (row) => row.paymentAttemptId && row.paymentAttemptId === paymentAttemptId
    )
  )[0] || null;
}

function createRecoveryRecord(recoveryStore, owner, timestamp) {
  const recoveryToken = crypto.randomBytes(24).toString("hex");
  const record = {
    id: generateId("recovery"),
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    userId: owner.ownerType === CART_OWNER_TYPES.CUSTOMER ? owner.ownerId : null,
    sessionId: owner.ownerType === CART_OWNER_TYPES.GUEST ? owner.ownerId : null,
    customerName: "",
    email: "",
    mobile: "",
    cartItems: [],
    cartItemCount: 0,
    cartValue: 0,
    stage: RECOVERY_STAGES.ACTIVE,
    checkoutSessionId: null,
    paymentAttemptId: "",
    gatewayOrderId: "",
    failureReason: "",
    feedbackReason: "",
    feedbackNote: "",
    paymentMethod: "",
    shippingMethod: "",
    billingAddress: {},
    shippingAddress: {},
    lastActivityAt: timestamp,
    reminderCount: 0,
    reminders: [],
    nextReminderAt: null,
    recoveryToken,
    recoveryUrl: buildRecoveryUrl(recoveryToken),
    restoredAt: null,
    recoveredAt: null,
    recoveredOrderId: null,
    abandonedAt: null,
    expiredAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  recoveryStore.recoveries.push(record);
  return record;
}

function findOrCreateRecovery(recoveryStore, owner, lookup = {}, timestamp = nowIso()) {
  return (
    (lookup.paymentAttemptId
      ? findRecoveryByPaymentAttemptId(recoveryStore, lookup.paymentAttemptId)
      : null) ||
    (lookup.checkoutSessionId
      ? findRecoveryByCheckoutSessionId(recoveryStore, lookup.checkoutSessionId)
      : null) ||
    findOpenRecoveryByOwner(recoveryStore, owner) ||
    createRecoveryRecord(recoveryStore, owner, timestamp)
  );
}

function computeNextReminderAt(record) {
  if (isClosedStage(record.stage) || Number(record.reminderCount || 0) >= REMINDER_SCHEDULE_MINUTES.length) {
    return null;
  }

  return addMinutes(
    record.lastActivityAt || record.updatedAt || record.createdAt || nowIso(),
    REMINDER_SCHEDULE_MINUTES[Number(record.reminderCount || 0)]
  );
}

function refreshRecordLifecycle(record, timestamp) {
  let changed = false;

  if (isClosedStage(record.stage)) {
    record.nextReminderAt = null;
    return changed;
  }

  if (Number(record.cartItemCount || 0) <= 0) {
    record.stage = RECOVERY_STAGES.EXPIRED;
    record.expiredAt = record.expiredAt || timestamp;
    record.nextReminderAt = null;
    changed = true;
    return changed;
  }

  if (Number(record.reminderCount || 0) >= REMINDER_SCHEDULE_MINUTES.length) {
    if (record.stage !== RECOVERY_STAGES.EXPIRED) {
      record.stage = RECOVERY_STAGES.EXPIRED;
      record.expiredAt = record.expiredAt || timestamp;
      changed = true;
    }
    record.nextReminderAt = null;
    return changed;
  }

  const nextReminderAt = computeNextReminderAt(record);
  if (record.nextReminderAt !== nextReminderAt) {
    record.nextReminderAt = nextReminderAt;
    changed = true;
  }

  if (
    nextReminderAt &&
    (parseDateOrNull(nextReminderAt) || 0) <= (parseDateOrNull(timestamp) || Date.now()) &&
    record.stage !== RECOVERY_STAGES.ABANDONED
  ) {
    record.stage = RECOVERY_STAGES.ABANDONED;
    record.abandonedAt = record.abandonedAt || timestamp;
    changed = true;
  }

  return changed;
}

async function refreshRecoveryStore(timestamp = nowIso()) {
  const recoveryStore = await readRecoveryStore();
  ensureRecoveryStoreShape(recoveryStore);

  let changed = false;
  for (const record of ensureArray(recoveryStore.recoveries)) {
    if (refreshRecordLifecycle(record, timestamp)) {
      record.updatedAt = timestamp;
      changed = true;
    }
  }

  if (changed) {
    await writeRecoveryStore(recoveryStore);
  }

  return recoveryStore;
}

async function writeTrackedRecovery(owner, cartView, options = {}) {
  const timestamp = options.timestamp || nowIso();
  const [authStore, recoveryStore] = await Promise.all([
    readAuthStore(),
    readRecoveryStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureRecoveryStoreShape(recoveryStore);

  const record = findOrCreateRecovery(
    recoveryStore,
    owner,
    {
      checkoutSessionId: options.checkoutSessionId || "",
      paymentAttemptId: options.paymentAttemptId || ""
    },
    timestamp
  );

  const cartSnapshot = summarizeCartView(cartView);
  const contactSnapshot = resolveContactSnapshot(authStore, owner, options, record);

  record.ownerType = owner.ownerType;
  record.ownerId = owner.ownerId;
  record.userId = owner.ownerType === CART_OWNER_TYPES.CUSTOMER ? owner.ownerId : null;
  record.sessionId = owner.ownerType === CART_OWNER_TYPES.GUEST ? owner.ownerId : null;
  record.customerName = contactSnapshot.customerName;
  record.email = contactSnapshot.email;
  record.mobile = contactSnapshot.mobile;
  record.cartItems = cartSnapshot.cartItems;
  record.cartItemCount = cartSnapshot.cartItemCount;
  record.cartValue = cartSnapshot.cartValue;
  record.stage =
    cartSnapshot.cartItemCount > 0 ? options.stage || RECOVERY_STAGES.CART_ADDED : RECOVERY_STAGES.EXPIRED;
  record.checkoutSessionId = options.checkoutSessionId || record.checkoutSessionId || null;
  record.paymentAttemptId = options.paymentAttemptId || record.paymentAttemptId || "";
  record.gatewayOrderId = options.gatewayOrderId || record.gatewayOrderId || "";
  record.paymentMethod = options.paymentMethod || record.paymentMethod || "";
  record.shippingMethod = options.shippingMethod || record.shippingMethod || "";
  record.billingAddress = options.billingAddress || record.billingAddress || {};
  record.shippingAddress = options.shippingAddress || record.shippingAddress || {};
  record.failureReason = options.failureReason || record.failureReason || "";
  record.lastActivityAt = timestamp;
  record.updatedAt = timestamp;

  refreshRecordLifecycle(record, timestamp);

  await writeRecoveryStore(recoveryStore);
  return sanitizeRecoveryDetail(record);
}

function buildSupportInfo(settingsBundle) {
  return {
    storeName: settingsBundle?.storeProfile?.storeName || "Jenix India",
    supportEmail:
      settingsBundle?.contactInformation?.publicEmail ||
      settingsBundle?.storeProfile?.supportEmail ||
      "",
    supportPhone:
      settingsBundle?.contactInformation?.publicPhone ||
      settingsBundle?.storeProfile?.supportMobile ||
      "",
    supportWhatsApp: settingsBundle?.contactInformation?.publicWhatsApp || ""
  };
}

function resolveReminderTarget(record) {
  if (record.email) {
    return {
      channel: "email",
      target: record.email
    };
  }

  if (record.mobile) {
    return {
      channel: "whatsapp",
      target: record.mobile
    };
  }

  return null;
}

function buildReminderMessage(record, supportInfo) {
  const name = record.customerName || "there";
  const itemWord = Number(record.cartItemCount || 0) === 1 ? "item" : "items";
  return `Hi ${name}, you left ${record.cartItemCount} ${itemWord} worth INR ${Number(
    record.cartValue || 0
  ).toFixed(2)} in your cart. Restore here: ${record.recoveryUrl}. Support: ${
    supportInfo.supportWhatsApp || supportInfo.supportPhone || supportInfo.supportEmail || "Jenix India"
  }`;
}

async function listRecoveries(filters) {
  const recoveryStore = await refreshRecoveryStore(nowIso());
  let records = sortNewestFirst(ensureArray(recoveryStore.recoveries));

  if (filters.stage) {
    records = records.filter((row) => row.stage === filters.stage);
  }

  if (filters.customerId) {
    records = records.filter((row) => row.userId === filters.customerId);
  }

  if (filters.dueOnly) {
    records = records.filter((row) => {
      const reminderTarget = resolveReminderTarget(row);
      return Boolean(
        reminderTarget &&
          row.nextReminderAt &&
          !isClosedStage(row.stage) &&
          (parseDateOrNull(row.nextReminderAt) || 0) <= Date.now()
      );
    });
  }

  return records.slice(0, Number(filters.limit || 50)).map(sanitizeRecoverySummary);
}

async function getRecoverySummary() {
  const recoveryStore = await refreshRecoveryStore(nowIso());
  const summary = {
    total: 0,
    dueReminders: 0,
    byStage: {}
  };

  for (const stage of Object.values(RECOVERY_STAGES)) {
    summary.byStage[stage] = 0;
  }

  for (const record of ensureArray(recoveryStore.recoveries)) {
    summary.total += 1;
    summary.byStage[record.stage] = Number(summary.byStage[record.stage] || 0) + 1;

    if (
      record.nextReminderAt &&
      !isClosedStage(record.stage) &&
      resolveReminderTarget(record) &&
      (parseDateOrNull(record.nextReminderAt) || 0) <= Date.now()
    ) {
      summary.dueReminders += 1;
    }
  }

  return summary;
}

async function getRecoveryDetail(recoveryId) {
  const recoveryStore = await refreshRecoveryStore(nowIso());
  const record = ensureArray(recoveryStore.recoveries).find((row) => row.id === recoveryId);

  if (!record) {
    throw new HttpError(404, "Recovery record not found.");
  }

  return sanitizeRecoveryDetail(record);
}

async function runReminderDispatch(payload, actor) {
  const timestamp = payload.nowIso || nowIso();
  const [recoveryStore, settingsBundle] = await Promise.all([
    refreshRecoveryStore(timestamp),
    getPublicSettingsBundle()
  ]);
  ensureRecoveryStoreShape(recoveryStore);

  const supportInfo = buildSupportInfo(settingsBundle);
  const reminders = [];
  let changed = false;

  for (const record of sortNewestFirst(ensureArray(recoveryStore.recoveries))) {
    if (reminders.length >= Number(payload.limit || 50)) {
      break;
    }

    if (isClosedStage(record.stage) || !record.nextReminderAt) {
      continue;
    }

    const reminderTarget = resolveReminderTarget(record);
    if (!reminderTarget) {
      continue;
    }

    if ((parseDateOrNull(record.nextReminderAt) || 0) > (parseDateOrNull(timestamp) || 0)) {
      continue;
    }

    const offsetMinutes =
      REMINDER_SCHEDULE_MINUTES[Number(record.reminderCount || 0)] || 0;
    const messagePreview = buildReminderMessage(record, supportInfo);
    const reminder = {
      id: generateId("cart_reminder"),
      reminderNumber: Number(record.reminderCount || 0) + 1,
      offsetMinutes,
      scheduledAt: record.nextReminderAt,
      sentAt: timestamp,
      channel: reminderTarget.channel,
      target: reminderTarget.target,
      recoveryUrl: record.recoveryUrl,
      messagePreview
    };

    record.reminders.push(reminder);
    record.reminderCount = Number(record.reminderCount || 0) + 1;
    record.updatedAt = timestamp;
    reminders.push({
      recoveryId: record.id,
      stage: record.stage,
      ...reminder
    });
    changed = true;

    refreshRecordLifecycle(record, timestamp);
  }

  if (changed) {
    await writeRecoveryStore(recoveryStore);
  }

  for (const reminder of reminders) {
    await addActivityLog({
      action: "abandoned_cart.reminder.sent",
      actorId: actor?.id || "system",
      actorRole: actor?.role || "system",
      resourceType: "abandoned_cart_recovery",
      resourceId: reminder.recoveryId,
      metadata: {
        reminderNumber: reminder.reminderNumber,
        channel: reminder.channel
      }
    });
  }

  return {
    nowIso: timestamp,
    dispatchedCount: reminders.length,
    reminders
  };
}

async function getPublicRecoveryPreview(recoveryToken) {
  const [recoveryStore, settingsBundle] = await Promise.all([
    refreshRecoveryStore(nowIso()),
    getPublicSettingsBundle()
  ]);

  const record = ensureArray(recoveryStore.recoveries).find(
    (row) => row.recoveryToken === recoveryToken
  );
  if (!record) {
    throw new HttpError(404, "Recovery link not found.");
  }
  if (record.stage === RECOVERY_STAGES.EXPIRED) {
    throw new HttpError(410, "Recovery link expired.");
  }

  return {
    recovery: sanitizeRecoveryDetail(record),
    feedbackOptions: RECOVERY_FEEDBACK_REASONS,
    support: buildSupportInfo(settingsBundle),
    canRestore: record.stage !== RECOVERY_STAGES.RECOVERED
  };
}

function resolveRestoreOwner(context, payload) {
  if (context.customerId) {
    return {
      ownerType: CART_OWNER_TYPES.CUSTOMER,
      ownerId: context.customerId
    };
  }

  if (payload.targetSessionId) {
    return {
      ownerType: CART_OWNER_TYPES.GUEST,
      ownerId: payload.targetSessionId
    };
  }

  throw new HttpError(400, "Customer login or targetSessionId is required for cart restore.");
}

function ensureTargetCart(authStore, owner) {
  const collection =
    owner.ownerType === CART_OWNER_TYPES.CUSTOMER ? authStore.userCarts : authStore.guestCarts;
  const key = owner.ownerType === CART_OWNER_TYPES.CUSTOMER ? "userId" : "sessionId";

  let cart = collection.find((row) => row[key] === owner.ownerId);
  if (!cart) {
    cart = {
      [key]: owner.ownerId,
      items: [],
      updatedAt: nowIso()
    };
    collection.push(cart);
  }
  if (!Array.isArray(cart.items)) {
    cart.items = [];
  }
  return cart;
}

async function restoreRecoveryCart(context, recoveryToken, payload) {
  const targetOwner = resolveRestoreOwner(context, payload);
  const [authStore, recoveryStore] = await Promise.all([
    readAuthStore(),
    refreshRecoveryStore(nowIso())
  ]);
  ensureAuthStoreShape(authStore);
  ensureRecoveryStoreShape(recoveryStore);

  const record = ensureArray(recoveryStore.recoveries).find(
    (row) => row.recoveryToken === recoveryToken
  );
  if (!record) {
    throw new HttpError(404, "Recovery link not found.");
  }
  if (record.stage === RECOVERY_STAGES.EXPIRED) {
    throw new HttpError(410, "Recovery link expired.");
  }

  const snapshotItems = ensureArray(record.cartItems)
    .map((item) => ({
      productId: item.productId,
      qty: Number(item.qty || 0)
    }))
    .filter((item) => item.productId && Number(item.qty || 0) > 0);

  if (snapshotItems.length === 0) {
    throw new HttpError(409, "Recovery cart is empty.");
  }

  const targetCart = ensureTargetCart(authStore, targetOwner);

  if (payload.mode === "merge") {
    const qtyMap = new Map();
    for (const item of ensureArray(targetCart.items)) {
      qtyMap.set(item.productId, Number(item.qty || 0));
    }
    for (const item of snapshotItems) {
      qtyMap.set(
        item.productId,
        Number(qtyMap.get(item.productId) || 0) + Number(item.qty || 0)
      );
    }
    targetCart.items = [...qtyMap.entries()].map(([productId, qty]) => ({
      productId,
      qty
    }));
  } else {
    targetCart.items = snapshotItems;
  }

  const timestamp = nowIso();
  targetCart.updatedAt = timestamp;
  record.stage = RECOVERY_STAGES.RECOVERED;
  record.restoredAt = timestamp;
  record.recoveredAt = timestamp;
  record.updatedAt = timestamp;
  record.nextReminderAt = null;

  await Promise.all([writeAuthStore(authStore), writeRecoveryStore(recoveryStore)]);

  await addActivityLog({
    action: "abandoned_cart.recovered",
    actorId: targetOwner.ownerId,
    actorRole: targetOwner.ownerType,
    resourceType: "abandoned_cart_recovery",
    resourceId: record.id
  });

  return {
    restored: true,
    restoredTo: targetOwner,
    itemCount: targetCart.items.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    recovery: sanitizeRecoverySummary(record)
  };
}

async function saveRecoveryFeedback(recoveryToken, payload) {
  const recoveryStore = await readRecoveryStore();
  ensureRecoveryStoreShape(recoveryStore);

  const record = ensureArray(recoveryStore.recoveries).find(
    (row) => row.recoveryToken === recoveryToken
  );
  if (!record) {
    throw new HttpError(404, "Recovery link not found.");
  }

  record.feedbackReason = payload.reason;
  record.feedbackNote = payload.note || "";
  record.updatedAt = nowIso();

  await writeRecoveryStore(recoveryStore);

  await addActivityLog({
    action: "abandoned_cart.feedback.saved",
    actorId: record.ownerId || "guest",
    actorRole: record.ownerType || "guest",
    resourceType: "abandoned_cart_recovery",
    resourceId: record.id
  });

  return sanitizeRecoveryDetail(record);
}

async function trackCartSaved(owner, cartView) {
  return writeTrackedRecovery(owner, cartView, {
    stage: RECOVERY_STAGES.CART_ADDED
  });
}

async function trackCheckoutStarted(owner, checkoutSession, order = null) {
  return writeTrackedRecovery(owner, checkoutSession.cart, {
    stage:
      checkoutSession.paymentMethod === "online"
        ? RECOVERY_STAGES.CHECKOUT_STARTED
        : RECOVERY_STAGES.PAYMENT_PENDING,
    checkoutSessionId: checkoutSession.id,
    paymentMethod: checkoutSession.paymentMethod,
    shippingMethod: checkoutSession.shippingMethod,
    billingAddress: checkoutSession.billingAddress || order?.billingAddress || {},
    shippingAddress: checkoutSession.shippingAddress || order?.shippingAddress || {},
    failureReason: ""
  });
}

async function trackPaymentAttemptCreated(owner, checkoutSession, paymentAttempt) {
  return writeTrackedRecovery(owner, checkoutSession.cart, {
    stage: RECOVERY_STAGES.PAYMENT_PENDING,
    checkoutSessionId: checkoutSession.id,
    paymentAttemptId: paymentAttempt.id,
    gatewayOrderId: paymentAttempt.gatewayOrderId || "",
    paymentMethod: checkoutSession.paymentMethod,
    shippingMethod: checkoutSession.shippingMethod,
    billingAddress: checkoutSession.billingAddress || {},
    shippingAddress: checkoutSession.shippingAddress || {},
    failureReason: ""
  });
}

async function trackPaymentFailed(owner, checkoutSession, paymentAttempt, failureReason) {
  return writeTrackedRecovery(owner, checkoutSession.cart, {
    stage: RECOVERY_STAGES.PAYMENT_FAILED,
    checkoutSessionId: checkoutSession.id,
    paymentAttemptId: paymentAttempt?.id || "",
    gatewayOrderId: paymentAttempt?.gatewayOrderId || "",
    paymentMethod: checkoutSession.paymentMethod,
    shippingMethod: checkoutSession.shippingMethod,
    billingAddress: checkoutSession.billingAddress || {},
    shippingAddress: checkoutSession.shippingAddress || {},
    failureReason: failureReason || "payment_failed"
  });
}

async function trackRecoveryCompleted(owner, checkoutSessionId, orderId) {
  const recoveryStore = await readRecoveryStore();
  ensureRecoveryStoreShape(recoveryStore);

  const record =
    findRecoveryByCheckoutSessionId(recoveryStore, checkoutSessionId) ||
    findOpenRecoveryByOwner(recoveryStore, owner);
  if (!record) {
    return null;
  }

  record.stage = RECOVERY_STAGES.RECOVERED;
  record.recoveredAt = nowIso();
  record.recoveredOrderId = orderId || null;
  record.updatedAt = record.recoveredAt;
  record.nextReminderAt = null;

  await writeRecoveryStore(recoveryStore);
  return sanitizeRecoverySummary(record);
}

module.exports = {
  listRecoveries,
  getRecoverySummary,
  getRecoveryDetail,
  runReminderDispatch,
  getPublicRecoveryPreview,
  restoreRecoveryCart,
  saveRecoveryFeedback,
  trackCartSaved,
  trackCheckoutStarted,
  trackPaymentAttemptCreated,
  trackPaymentFailed,
  trackRecoveryCompleted
};
