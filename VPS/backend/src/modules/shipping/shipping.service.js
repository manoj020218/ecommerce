const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const {
  cloneDefaultShippingStore,
  readShippingStore,
  writeShippingStore
} = require("../../database/shipping-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  safeSendTemplateNotification
} = require("../marketing/marketing.service");
const {
  createShippingProvider
} = require("../../integrations/shipping-providers/shipping-provider.adapter");
const {
  SHIPPING_METHODS,
  SHIPPING_ZONES,
  SHIPPING_ZONE_LABELS,
  SHIPMENT_STATUSES,
  SHIPPING_API_PROVIDERS,
  sanitizeRateCard,
  sanitizeCourierProfile,
  sanitizeShipment
} = require("./shipping.model");
const { resolveBillableWeightKg } = require("./shipping-calculator");

function nowIso() {
  return new Date().toISOString();
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStateCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 10);
}

function normalizePincodePrefix(value) {
  return String(value || "")
    .trim()
    .replace(/[^0-9]/g, "")
    .slice(0, 6);
}

function normalizeStringList(values, transform) {
  const output = [];
  const seen = new Set();

  for (const value of ensureArray(values)) {
    const normalized = transform(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    output.push(normalized);
    seen.add(normalized);
  }

  return output;
}

function buildPublicUploadUrl(fullFilePath) {
  const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);
  const relativePath = path.relative(uploadsRoot, fullFilePath).replace(/\\/g, "/");
  return `${env.publicBaseUrl}/static/uploads/${relativePath}`;
}

function ensureShippingStoreShape(store) {
  const defaults = cloneDefaultShippingStore();
  let changed = false;

  if (!store.settings || typeof store.settings !== "object" || Array.isArray(store.settings)) {
    store.settings = cloneValue(defaults.settings);
    changed = true;
  }

  if (!Array.isArray(store.settings.localPincodePrefixes)) {
    store.settings.localPincodePrefixes = cloneValue(defaults.settings.localPincodePrefixes);
    changed = true;
  }

  if (!Array.isArray(store.settings.remotePincodePrefixes)) {
    store.settings.remotePincodePrefixes = cloneValue(defaults.settings.remotePincodePrefixes);
    changed = true;
  }

  if (
    !store.settings.remoteExtraChargeByMethod ||
    typeof store.settings.remoteExtraChargeByMethod !== "object" ||
    Array.isArray(store.settings.remoteExtraChargeByMethod)
  ) {
    store.settings.remoteExtraChargeByMethod = cloneValue(
      defaults.settings.remoteExtraChargeByMethod
    );
    changed = true;
  }

  if (
    !store.settings.zoneStateMap ||
    typeof store.settings.zoneStateMap !== "object" ||
    Array.isArray(store.settings.zoneStateMap)
  ) {
    store.settings.zoneStateMap = cloneValue(defaults.settings.zoneStateMap);
    changed = true;
  }

  for (const zoneKey of [
    SHIPPING_ZONES.NORTH_INDIA,
    SHIPPING_ZONES.WEST_INDIA,
    SHIPPING_ZONES.SOUTH_INDIA,
    SHIPPING_ZONES.NORTH_EAST_REMOTE
  ]) {
    if (!Array.isArray(store.settings.zoneStateMap[zoneKey])) {
      store.settings.zoneStateMap[zoneKey] = cloneValue(
        defaults.settings.zoneStateMap[zoneKey] || []
      );
      changed = true;
    }
  }

  if (!Array.isArray(store.rateCards)) {
    store.rateCards = cloneValue(defaults.rateCards);
    changed = true;
  }

  if (!Array.isArray(store.courierProfiles)) {
    store.courierProfiles = [];
    changed = true;
  }

  if (!Array.isArray(store.shipments)) {
    store.shipments = [];
    changed = true;
  }

  if (!Array.isArray(store.trackingEmailLogs)) {
    store.trackingEmailLogs = [];
    changed = true;
  }

  return changed;
}

function ensureAuthStoreShape(store) {
  let changed = false;
  if (!Array.isArray(store.users)) {
    store.users = [];
    changed = true;
  }
  if (!Array.isArray(store.orders)) {
    store.orders = [];
    changed = true;
  }
  if (!Array.isArray(store.checkoutSessions)) {
    store.checkoutSessions = [];
    changed = true;
  }
  if (!Array.isArray(store.guestCarts)) {
    store.guestCarts = [];
    changed = true;
  }
  return changed;
}

function normalizeShippingSettingsPatch(currentSettings, patch) {
  const next = {
    ...currentSettings,
    zoneStateMap: {
      ...(currentSettings.zoneStateMap || {})
    },
    remoteExtraChargeByMethod: {
      ...(currentSettings.remoteExtraChargeByMethod || {})
    }
  };

  if (patch.originStateCode !== undefined) {
    next.originStateCode = normalizeStateCode(patch.originStateCode);
  }

  if (patch.localPincodePrefixes !== undefined) {
    next.localPincodePrefixes = normalizeStringList(
      patch.localPincodePrefixes,
      normalizePincodePrefix
    );
  }

  if (patch.remotePincodePrefixes !== undefined) {
    next.remotePincodePrefixes = normalizeStringList(
      patch.remotePincodePrefixes,
      normalizePincodePrefix
    );
  }

  if (patch.remoteExtraChargeByMethod !== undefined) {
    const allowed = Object.values(SHIPPING_METHODS);
    const updated = {
      ...next.remoteExtraChargeByMethod
    };

    for (const [key, value] of Object.entries(patch.remoteExtraChargeByMethod || {})) {
      if (!allowed.includes(key)) {
        continue;
      }
      updated[key] = Number(value || 0);
    }

    next.remoteExtraChargeByMethod = updated;
  }

  if (patch.zoneStateMap !== undefined) {
    const incoming = patch.zoneStateMap || {};
    for (const key of [
      SHIPPING_ZONES.NORTH_INDIA,
      SHIPPING_ZONES.WEST_INDIA,
      SHIPPING_ZONES.SOUTH_INDIA,
      SHIPPING_ZONES.NORTH_EAST_REMOTE
    ]) {
      if (incoming[key] !== undefined) {
        next.zoneStateMap[key] = normalizeStringList(incoming[key], normalizeStateCode);
      }
    }
  }

  return next;
}

function findOrderByIdOrNo(authStore, orderId) {
  return ensureArray(authStore.orders).find(
    (order) => order.id === orderId || order.orderNo === orderId
  );
}

function findOrderById(authStore, orderId) {
  return ensureArray(authStore.orders).find((order) => order.id === orderId);
}

function findShipmentById(shippingStore, shipmentId) {
  return ensureArray(shippingStore.shipments).find((shipment) => shipment.id === shipmentId);
}

function findCourierById(shippingStore, courierProfileId) {
  return ensureArray(shippingStore.courierProfiles).find(
    (profile) => profile.id === courierProfileId
  );
}

function assertDispatchableOrder(order) {
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  const payStatus = String(order.paymentStatus || "").toLowerCase();
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  // Allow paid orders, processing orders, or COD orders
  if (payStatus !== "paid" && orderStatus !== "processing" && order.paymentMethod !== "cod") {
    throw new HttpError(409, "Shipment can only be created for paid or processing orders.");
  }
}

function assertPaidOrder(order) {
  assertDispatchableOrder(order);
}

function mapOrderSummary(order) {
  if (!order) {
    return null;
  }

  return {
    id: order.id,
    orderNo: order.orderNo,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    shipmentStatus: order.shipmentStatus,
    shippingMethod: order.shippingMethod,
    shippingCharge: Number(order.shippingCharge || 0),
    grandTotal: Number(order.grandTotal || 0),
    createdAt: order.createdAt || null
  };
}

function resolvePackageWeightKg(order, authStore, catalogStore) {
  const checkoutSession = ensureArray(authStore.checkoutSessions).find(
    (row) => row.id === order.checkoutSessionId
  );
  const fromSession = Number(
    checkoutSession?.cart?.pricing?.shippingMeta?.totalWeightKg || 0
  );
  if (fromSession > 0) {
    return roundMoney(fromSession);
  }

  const productById = new Map(
    ensureArray(catalogStore.products).map((product) => [product.id, product])
  );

  const lines = [];
  for (const item of ensureArray(order.items)) {
    const product = productById.get(item.productId);
    if (!product) {
      continue;
    }
    lines.push({
      qty: Number(item.qty || 0),
      deadWeightKg: Number(product.deadWeightKg || 0),
      lengthCm:
        product.lengthCm === null || product.lengthCm === undefined
          ? null
          : Number(product.lengthCm),
      widthCm:
        product.widthCm === null || product.widthCm === undefined
          ? null
          : Number(product.widthCm),
      heightCm:
        product.heightCm === null || product.heightCm === undefined
          ? null
          : Number(product.heightCm)
    });
  }

  return roundMoney(resolveBillableWeightKg(lines));
}

function applyOrderShipmentStatus(order, shipmentStatus) {
  if (!order) {
    return;
  }

  order.shipmentStatus = shipmentStatus;

  if (shipmentStatus === SHIPMENT_STATUSES.DELIVERED) {
    order.orderStatus = "delivered";
  } else if (shipmentStatus === SHIPMENT_STATUSES.CANCELLED) {
    order.orderStatus = "cancelled";
  }
}

function normalizeTrackingValue(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveOrderContactEmail(order, authStore) {
  const fromShipping = String(order?.shippingAddress?.email || "")
    .trim()
    .toLowerCase();
  if (fromShipping) {
    return fromShipping;
  }

  const fromBilling = String(order?.billingAddress?.email || "")
    .trim()
    .toLowerCase();
  if (fromBilling) {
    return fromBilling;
  }

  const user = ensureArray(authStore.users).find((row) => row.id === order?.userId);
  if (user && user.email) {
    return String(user.email).trim().toLowerCase();
  }

  return "";
}

function resolveOrderContactName(order) {
  return (
    order?.billingAddress?.companyName ||
    order?.billingAddress?.name ||
    order?.shippingAddress?.companyName ||
    order?.shippingAddress?.name ||
    "Customer"
  );
}

function sanitizeTrackingEmailLog(log) {
  return {
    id: log.id,
    shipmentId: log.shipmentId,
    orderId: log.orderId,
    orderNo: log.orderNo,
    toEmail: log.toEmail,
    ccEmail: log.ccEmail || "",
    subject: log.subject,
    status: log.status,
    sentAt: log.sentAt,
    sentBy: log.sentBy
  };
}

function buildQueueRow(order, shipment) {
  if (!shipment) {
    return {
      shipmentId: null,
      orderId: order.id,
      orderNo: order.orderNo || "",
      paymentStatus: order.paymentStatus || "",
      orderStatus: order.orderStatus || "",
      shipmentStatus: order.shipmentStatus || SHIPMENT_STATUSES.PENDING_PACKING,
      shippingMethod: order.shippingMethod || SHIPPING_METHODS.STANDARD,
      shippingCharge: Number(order.shippingCharge || 0),
      grandTotal: Number(order.grandTotal || 0),
      courierCode: "",
      courierName: "",
      trackingId: "",
      trackingUrl: "",
      dispatchDate: "",
      expectedDeliveryDate: "",
      podStatus: "pending",
      podFileUrl: "",
      deliveredAt: "",
      createdAt: order.createdAt || "",
      updatedAt: order.createdAt || ""
    };
  }

  return {
    shipmentId: shipment.id,
    orderId: order.id,
    orderNo: order.orderNo || shipment.orderNo || "",
    paymentStatus: order.paymentStatus || "",
    orderStatus: order.orderStatus || "",
    shipmentStatus: shipment.shipmentStatus,
    shippingMethod: order.shippingMethod || SHIPPING_METHODS.STANDARD,
    shippingCharge: Number(order.shippingCharge || 0),
    grandTotal: Number(order.grandTotal || 0),
    courierCode: shipment.courierCode || "",
    courierName: shipment.courierName || "",
    trackingId: shipment.trackingId || "",
    trackingUrl: shipment.trackingUrl || "",
    dispatchDate: shipment.dispatchDate || "",
    expectedDeliveryDate: shipment.expectedDeliveryDate || "",
    podStatus: shipment.podStatus || "pending",
    podFileUrl: shipment.podFileUrl || "",
    deliveredAt: shipment.deliveredAt || "",
    createdAt: shipment.createdAt || order.createdAt || "",
    updatedAt: shipment.updatedAt || shipment.createdAt || order.createdAt || ""
  };
}

async function getShippingSettings() {
  const shippingStore = await readShippingStore();
  const changed = ensureShippingStoreShape(shippingStore);
  if (changed) {
    await writeShippingStore(shippingStore);
  }

  return {
    settings: shippingStore.settings,
    methods: Object.values(SHIPPING_METHODS),
    zones: Object.values(SHIPPING_ZONES).map((zone) => ({
      id: zone,
      label: SHIPPING_ZONE_LABELS[zone] || zone
    })),
    statuses: Object.values(SHIPMENT_STATUSES),
    apiProviders: Object.values(SHIPPING_API_PROVIDERS)
  };
}

async function patchShippingSettings(patch, actor) {
  const shippingStore = await readShippingStore();
  ensureShippingStoreShape(shippingStore);

  shippingStore.settings = normalizeShippingSettingsPatch(shippingStore.settings, patch);
  await writeShippingStore(shippingStore);

  await addActivityLog({
    action: "shipping.settings.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipping_settings",
    resourceId: "default",
    metadata: {
      changedFields: Object.keys(patch || {})
    }
  });

  return shippingStore.settings;
}

async function listRateCards(filters) {
  const shippingStore = await readShippingStore();
  const changed = ensureShippingStoreShape(shippingStore);
  if (changed) {
    await writeShippingStore(shippingStore);
  }

  let rows = ensureArray(shippingStore.rateCards);
  if (!filters.includeInactive) {
    rows = rows.filter((row) => row.isActive !== false);
  }
  if (filters.shippingMethod) {
    rows = rows.filter((row) => row.shippingMethod === filters.shippingMethod);
  }
  if (filters.zone) {
    rows = rows.filter((row) => row.zone === filters.zone);
  }

  return rows
    .map(sanitizeRateCard)
    .sort((a, b) =>
      `${a.shippingMethod}:${a.zone}`.localeCompare(`${b.shippingMethod}:${b.zone}`)
    );
}

async function createRateCard(payload, actor) {
  const shippingStore = await readShippingStore();
  ensureShippingStoreShape(shippingStore);

  const duplicate = ensureArray(shippingStore.rateCards).find(
    (row) => row.shippingMethod === payload.shippingMethod && row.zone === payload.zone
  );
  if (duplicate) {
    throw new HttpError(
      409,
      "Rate card already exists for this shipping method and zone combination."
    );
  }

  const row = {
    id: generateId("ship_rate"),
    shippingMethod: payload.shippingMethod,
    zone: payload.zone,
    baseCharge: Number(payload.baseCharge || 0),
    perKgCharge: Number(payload.perKgCharge || 0),
    isActive: Boolean(payload.isActive),
    updatedAt: nowIso()
  };

  shippingStore.rateCards.push(row);
  await writeShippingStore(shippingStore);

  await addActivityLog({
    action: "shipping.rate_card.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipping_rate_card",
    resourceId: row.id
  });

  return sanitizeRateCard(row);
}

async function updateRateCard(rateCardId, patch, actor) {
  const shippingStore = await readShippingStore();
  ensureShippingStoreShape(shippingStore);

  const index = ensureArray(shippingStore.rateCards).findIndex((row) => row.id === rateCardId);
  if (index < 0) {
    throw new HttpError(404, "Rate card not found.");
  }

  const current = shippingStore.rateCards[index];
  shippingStore.rateCards[index] = {
    ...current,
    baseCharge:
      patch.baseCharge === undefined ? Number(current.baseCharge || 0) : Number(patch.baseCharge),
    perKgCharge:
      patch.perKgCharge === undefined
        ? Number(current.perKgCharge || 0)
        : Number(patch.perKgCharge),
    isActive: patch.isActive === undefined ? Boolean(current.isActive) : Boolean(patch.isActive),
    updatedAt: nowIso()
  };

  await writeShippingStore(shippingStore);

  await addActivityLog({
    action: "shipping.rate_card.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipping_rate_card",
    resourceId: rateCardId
  });

  return sanitizeRateCard(shippingStore.rateCards[index]);
}

async function listCourierProfiles(filters) {
  const shippingStore = await readShippingStore();
  const changed = ensureShippingStoreShape(shippingStore);
  if (changed) {
    await writeShippingStore(shippingStore);
  }

  let rows = ensureArray(shippingStore.courierProfiles);
  if (!filters.includeInactive) {
    rows = rows.filter((row) => row.isActive !== false);
  }

  return rows
    .map(sanitizeCourierProfile)
    .sort((a, b) => a.courierName.localeCompare(b.courierName));
}

async function createCourierProfile(payload, actor) {
  const shippingStore = await readShippingStore();
  ensureShippingStoreShape(shippingStore);

  const normalizedCode = String(payload.courierCode || "")
    .trim()
    .toUpperCase();
  const duplicate = ensureArray(shippingStore.courierProfiles).find(
    (row) => String(row.courierCode || "").trim().toUpperCase() === normalizedCode
  );
  if (duplicate) {
    throw new HttpError(409, "Courier code already exists.");
  }

  const now = nowIso();
  const row = {
    id: generateId("courier"),
    courierName: payload.courierName,
    courierCode: normalizedCode,
    trackingUrlTemplate: payload.trackingUrlTemplate,
    trackingPageUrl: payload.trackingPageUrl || "",
    supportPhone: payload.supportPhone || "",
    supportEmail: payload.supportEmail || "",
    apiEnabled: Boolean(payload.apiEnabled),
    apiProvider: payload.apiProvider || SHIPPING_API_PROVIDERS.MANUAL_COURIER,
    isActive: Boolean(payload.isActive),
    createdAt: now,
    updatedAt: now
  };

  shippingStore.courierProfiles.push(row);
  await writeShippingStore(shippingStore);

  await addActivityLog({
    action: "shipping.courier.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipping_courier",
    resourceId: row.id
  });

  return sanitizeCourierProfile(row);
}

async function updateCourierProfile(courierProfileId, patch, actor) {
  const shippingStore = await readShippingStore();
  ensureShippingStoreShape(shippingStore);

  const index = ensureArray(shippingStore.courierProfiles).findIndex(
    (row) => row.id === courierProfileId
  );
  if (index < 0) {
    throw new HttpError(404, "Courier profile not found.");
  }

  const current = shippingStore.courierProfiles[index];
  const next = {
    ...current,
    courierName:
      patch.courierName === undefined ? current.courierName : patch.courierName,
    trackingUrlTemplate:
      patch.trackingUrlTemplate === undefined
        ? current.trackingUrlTemplate
        : patch.trackingUrlTemplate,
    trackingPageUrl:
      patch.trackingPageUrl === undefined ? current.trackingPageUrl : patch.trackingPageUrl,
    supportPhone: patch.supportPhone === undefined ? current.supportPhone : patch.supportPhone,
    supportEmail: patch.supportEmail === undefined ? current.supportEmail : patch.supportEmail,
    apiEnabled: patch.apiEnabled === undefined ? Boolean(current.apiEnabled) : patch.apiEnabled,
    apiProvider: patch.apiProvider || current.apiProvider,
    isActive: patch.isActive === undefined ? Boolean(current.isActive) : patch.isActive,
    updatedAt: nowIso()
  };

  shippingStore.courierProfiles[index] = next;
  await writeShippingStore(shippingStore);

  await addActivityLog({
    action: "shipping.courier.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipping_courier",
    resourceId: courierProfileId
  });

  return sanitizeCourierProfile(next);
}

async function listShippingQueue(filters) {
  const [authStore, shippingStore] = await Promise.all([readAuthStore(), readShippingStore()]);
  const authChanged = ensureAuthStoreShape(authStore);
  const shippingChanged = ensureShippingStoreShape(shippingStore);

  const latestShipmentByOrderId = new Map();
  for (const shipment of ensureArray(shippingStore.shipments)) {
    const existing = latestShipmentByOrderId.get(shipment.orderId);
    if (!existing) {
      latestShipmentByOrderId.set(shipment.orderId, shipment);
      continue;
    }

    const existingTs = Date.parse(existing.updatedAt || existing.createdAt || "");
    const incomingTs = Date.parse(shipment.updatedAt || shipment.createdAt || "");
    if (incomingTs >= existingTs) {
      latestShipmentByOrderId.set(shipment.orderId, shipment);
    }
  }

  const paidOrders = ensureArray(authStore.orders).filter(
    (order) => String(order.paymentStatus || "").toLowerCase() === "paid"
  );

  let rows = paidOrders.map((order) =>
    buildQueueRow(order, latestShipmentByOrderId.get(order.id) || null)
  );

  if (filters.shipmentStatus) {
    rows = rows.filter((row) => row.shipmentStatus === filters.shipmentStatus);
  }

  rows.sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
  rows = rows.slice(0, Number(filters.limit || 100));

  if (authChanged) {
    await writeAuthStore(authStore);
  }
  if (shippingChanged) {
    await writeShippingStore(shippingStore);
  }

  return rows;
}

async function createShipment(payload, actor) {
  const [authStore, catalogStore, shippingStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureShippingStoreShape(shippingStore);

  const order = findOrderByIdOrNo(authStore, payload.orderId);
  assertPaidOrder(order);

  const existing = ensureArray(shippingStore.shipments).find(
    (shipment) =>
      shipment.orderId === order.id &&
      shipment.shipmentStatus !== SHIPMENT_STATUSES.CANCELLED
  );
  if (existing) {
    throw new HttpError(409, "Shipment already exists for this order.");
  }

  let courier = null;
  if (payload.courierProfileId) {
    courier = findCourierById(shippingStore, payload.courierProfileId);
    if (!courier) {
      throw new HttpError(404, "Courier profile not found.");
    }
    if (!courier.isActive) {
      throw new HttpError(409, "Selected courier profile is inactive.");
    }
  }

  const shipmentStatus = order.shipmentStatus || SHIPMENT_STATUSES.PENDING_PACKING;
  const now = nowIso();
  const shipment = {
    id: generateId("shipment"),
    orderId: order.id,
    orderNo: order.orderNo || "",
    shipmentStatus,
    courierProfileId: courier ? courier.id : null,
    courierCode: courier ? courier.courierCode : "",
    courierName: courier ? courier.courierName : "",
    trackingId: "",
    trackingUrl: "",
    dispatchDate: "",
    expectedDeliveryDate: "",
    packageWeightKg: resolvePackageWeightKg(order, authStore, catalogStore),
    packageCount: Number(payload.packageCount || 1),
    podStatus: "pending",
    podFileUrl: "",
    deliveredAt: "",
    adminNotes: payload.adminNotes || "",
    createdAt: now,
    updatedAt: now
  };

  shippingStore.shipments.push(shipment);
  applyOrderShipmentStatus(order, shipment.shipmentStatus);

  await Promise.all([writeAuthStore(authStore), writeShippingStore(shippingStore)]);

  await addActivityLog({
    action: "shipping.shipment.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipment",
    resourceId: shipment.id,
    metadata: {
      orderId: order.id
    }
  });

  return {
    shipment: sanitizeShipment(shipment),
    order: mapOrderSummary(order)
  };
}

async function getShipment(shipmentId) {
  const [authStore, shippingStore] = await Promise.all([readAuthStore(), readShippingStore()]);
  ensureAuthStoreShape(authStore);
  ensureShippingStoreShape(shippingStore);

  const shipment = findShipmentById(shippingStore, shipmentId);
  if (!shipment) {
    throw new HttpError(404, "Shipment not found.");
  }

  const order = findOrderById(authStore, shipment.orderId);

  return {
    shipment: sanitizeShipment(shipment),
    order: mapOrderSummary(order)
  };
}

async function updateShipmentTracking(shipmentId, payload, actor) {
  const [authStore, shippingStore] = await Promise.all([readAuthStore(), readShippingStore()]);
  ensureAuthStoreShape(authStore);
  ensureShippingStoreShape(shippingStore);

  const shipment = findShipmentById(shippingStore, shipmentId);
  if (!shipment) {
    throw new HttpError(404, "Shipment not found.");
  }

  const courier = findCourierById(shippingStore, payload.courierProfileId);
  if (!courier) {
    throw new HttpError(404, "Courier profile not found.");
  }

  const providerName = courier.apiProvider || SHIPPING_API_PROVIDERS.MANUAL_COURIER;
  let provider;
  try {
    provider = createShippingProvider(providerName);
  } catch (_error) {
    provider = createShippingProvider(SHIPPING_API_PROVIDERS.MANUAL_COURIER);
  }
  const providerResult = await provider.createShipment({
    trackingId: payload.trackingId,
    trackingUrlTemplate: courier.trackingUrlTemplate
  });

  let nextStatus = shipment.shipmentStatus;
  if (
    shipment.shipmentStatus === SHIPMENT_STATUSES.PENDING_PACKING ||
    shipment.shipmentStatus === SHIPMENT_STATUSES.PACKED ||
    shipment.shipmentStatus === SHIPMENT_STATUSES.READY_TO_DISPATCH
  ) {
    nextStatus = SHIPMENT_STATUSES.SHIPPED;
  }

  shipment.courierProfileId = courier.id;
  shipment.courierCode = courier.courierCode;
  shipment.courierName = courier.courierName;
  shipment.trackingId = providerResult.trackingId || payload.trackingId;
  shipment.trackingUrl = providerResult.trackingUrl || shipment.trackingUrl;
  shipment.dispatchDate = payload.dispatchDate || shipment.dispatchDate || "";
  shipment.expectedDeliveryDate =
    payload.expectedDeliveryDate || shipment.expectedDeliveryDate || "";
  shipment.shipmentStatus = nextStatus;
  shipment.updatedAt = nowIso();

  const order = findOrderById(authStore, shipment.orderId);
  applyOrderShipmentStatus(order, shipment.shipmentStatus);

  await Promise.all([writeAuthStore(authStore), writeShippingStore(shippingStore)]);
  await safeSendTemplateNotification({
    templateKey: "tracking_detail_update",
    toEmail: resolveOrderContactEmail(order, authStore),
    relatedResourceType: "shipment",
    relatedResourceId: shipment.id,
    variables: {
      customerName: resolveOrderContactName(order),
      orderNo: order?.orderNo || "",
      trackingId: shipment.trackingId || "",
      trackingUrl: shipment.trackingUrl || "",
      courierName: shipment.courierName || shipment.courierCode || ""
    }
  });

  await addActivityLog({
    action: "shipping.tracking.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipment",
    resourceId: shipment.id,
    metadata: {
      trackingId: shipment.trackingId,
      courierCode: shipment.courierCode
    }
  });

  return {
    shipment: sanitizeShipment(shipment),
    order: mapOrderSummary(order)
  };
}

async function updateShipmentStatus(shipmentId, payload, actor) {
  const [authStore, shippingStore] = await Promise.all([readAuthStore(), readShippingStore()]);
  ensureAuthStoreShape(authStore);
  ensureShippingStoreShape(shippingStore);

  const shipment = findShipmentById(shippingStore, shipmentId);
  if (!shipment) {
    throw new HttpError(404, "Shipment not found.");
  }

  shipment.shipmentStatus = payload.shipmentStatus;
  if (payload.adminNotes) {
    shipment.adminNotes = payload.adminNotes;
  }
  if (payload.shipmentStatus === SHIPMENT_STATUSES.DELIVERED) {
    shipment.deliveredAt = shipment.deliveredAt || nowIso();
  }
  shipment.updatedAt = nowIso();

  const order = findOrderById(authStore, shipment.orderId);
  applyOrderShipmentStatus(order, shipment.shipmentStatus);

  await Promise.all([writeAuthStore(authStore), writeShippingStore(shippingStore)]);

  await addActivityLog({
    action: "shipping.status.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipment",
    resourceId: shipment.id,
    metadata: {
      shipmentStatus: shipment.shipmentStatus
    }
  });

  return {
    shipment: sanitizeShipment(shipment),
    order: mapOrderSummary(order)
  };
}

async function sendTrackingEmail(shipmentId, payload, actor) {
  const [authStore, shippingStore] = await Promise.all([readAuthStore(), readShippingStore()]);
  ensureAuthStoreShape(authStore);
  ensureShippingStoreShape(shippingStore);

  const shipment = findShipmentById(shippingStore, shipmentId);
  if (!shipment) {
    throw new HttpError(404, "Shipment not found.");
  }

  if (!shipment.trackingId || !shipment.trackingUrl) {
    throw new HttpError(409, "Tracking details are missing for this shipment.");
  }

  const order = findOrderById(authStore, shipment.orderId);
  if (!order) {
    throw new HttpError(404, "Order not found for shipment.");
  }

  const toEmail =
    String(payload.toEmail || "")
      .trim()
      .toLowerCase() || resolveOrderContactEmail(order, authStore);
  if (!toEmail) {
    throw new HttpError(400, "Recipient email is required for tracking update.");
  }

  const subject = `Tracking update for order ${order.orderNo || order.id}`;
  const body = [
    `Courier: ${shipment.courierName || shipment.courierCode || "Manual Courier"}`,
    `Tracking ID: ${shipment.trackingId}`,
    `Tracking URL: ${shipment.trackingUrl}`
  ].join("\n");

  const log = {
    id: generateId("tracking_email"),
    shipmentId: shipment.id,
    orderId: order.id,
    orderNo: order.orderNo || "",
    toEmail,
    ccEmail: payload.ccEmail || "",
    subject,
    body,
    status: "sent",
    sentAt: nowIso(),
    sentBy: actor.id
  };

  shippingStore.trackingEmailLogs.push(log);
  await writeShippingStore(shippingStore);

  await addActivityLog({
    action: "shipping.tracking.email.sent",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipment",
    resourceId: shipment.id,
    metadata: {
      toEmail
    }
  });

  return sanitizeTrackingEmailLog(log);
}

async function uploadShipmentPod(shipmentId, fullFilePath, actor) {
  const shippingStore = await readShippingStore();
  ensureShippingStoreShape(shippingStore);

  const shipment = findShipmentById(shippingStore, shipmentId);
  if (!shipment) {
    throw new HttpError(404, "Shipment not found.");
  }

  shipment.podStatus = "uploaded";
  shipment.podFileUrl = buildPublicUploadUrl(fullFilePath);
  shipment.updatedAt = nowIso();

  await writeShippingStore(shippingStore);

  await addActivityLog({
    action: "shipping.pod.uploaded",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "shipment",
    resourceId: shipment.id
  });

  return sanitizeShipment(shipment);
}

async function estimateCartShipping(query) {
  const [authStore, catalogStore, shippingStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureShippingStoreShape(shippingStore);

  if (!query.sessionId) {
    throw new HttpError(400, "sessionId is required to estimate cart shipping.");
  }

  const cart = ensureArray(authStore.guestCarts).find(
    (row) => row.sessionId === query.sessionId
  );
  if (!cart || ensureArray(cart.items).length === 0) {
    throw new HttpError(404, "Guest cart not found for shipping estimate.");
  }

  const productById = new Map(
    ensureArray(catalogStore.products).map((product) => [product.id, product])
  );
  const lines = [];

  for (const item of ensureArray(cart.items)) {
    const product = productById.get(item.productId);
    if (!product || product.isActive === false) {
      continue;
    }

    lines.push({
      productId: product.id,
      qty: Number(item.qty || 0),
      deadWeightKg: Number(product.deadWeightKg || 0),
      lengthCm:
        product.lengthCm === null || product.lengthCm === undefined
          ? null
          : Number(product.lengthCm),
      widthCm:
        product.widthCm === null || product.widthCm === undefined
          ? null
          : Number(product.widthCm),
      heightCm:
        product.heightCm === null || product.heightCm === undefined
          ? null
          : Number(product.heightCm)
    });
  }

  if (lines.length === 0) {
    throw new HttpError(409, "No active products are available in the selected cart.");
  }

  const provider = createShippingProvider(SHIPPING_API_PROVIDERS.MANUAL_COURIER);
  const quote = await provider.calculateShipping({
    lines,
    shippingMethod: query.shippingMethod,
    destination: {
      pincode: query.pincode,
      stateCode: query.stateCode,
      state: query.state
    },
    shippingStore
  });

  return {
    sessionId: query.sessionId,
    shippingMethod: query.shippingMethod,
    destination: {
      pincode: query.pincode,
      stateCode: query.stateCode,
      state: query.state
    },
    itemCount: lines.reduce((sum, line) => sum + Number(line.qty || 0), 0),
    zone: quote.zone,
    zoneLabel: quote.zoneLabel,
    totalWeightKg: quote.totalWeightKg,
    baseCharge: quote.baseCharge,
    perKgCharge: quote.perKgCharge,
    remoteExtraCharge: quote.remoteExtraCharge,
    shippingCharge: roundMoney(quote.shippingCharge),
    currency: "INR"
  };
}

async function trackShipmentByTrackingId(trackingId) {
  const [authStore, shippingStore] = await Promise.all([readAuthStore(), readShippingStore()]);
  ensureAuthStoreShape(authStore);
  ensureShippingStoreShape(shippingStore);

  const normalized = normalizeTrackingValue(trackingId);
  if (!normalized) {
    throw new HttpError(400, "Tracking id is required.");
  }

  const shipment = ensureArray(shippingStore.shipments).find(
    (row) => normalizeTrackingValue(row.trackingId) === normalized
  );
  if (!shipment) {
    throw new HttpError(404, "Tracking record not found.");
  }

  const order = findOrderById(authStore, shipment.orderId);
  return {
    orderNo: order?.orderNo || shipment.orderNo || "",
    shipmentStatus: shipment.shipmentStatus,
    courierName: shipment.courierName || "",
    courierCode: shipment.courierCode || "",
    trackingId: shipment.trackingId || "",
    trackingUrl: shipment.trackingUrl || "",
    dispatchDate: shipment.dispatchDate || "",
    expectedDeliveryDate: shipment.expectedDeliveryDate || "",
    deliveredAt: shipment.deliveredAt || "",
    podStatus: shipment.podStatus || "pending"
  };
}

module.exports = {
  getShippingSettings,
  patchShippingSettings,
  listRateCards,
  createRateCard,
  updateRateCard,
  listCourierProfiles,
  createCourierProfile,
  updateCourierProfile,
  listShippingQueue,
  createShipment,
  getShipment,
  updateShipmentTracking,
  updateShipmentStatus,
  sendTrackingEmail,
  uploadShipmentPod,
  estimateCartShipping,
  trackShipmentByTrackingId
};
