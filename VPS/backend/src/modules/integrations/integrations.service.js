const { HttpError } = require("../../common/http-error");
const {
  cloneDefaultIntegrationsStore,
  readIntegrationsStore,
  writeIntegrationsStore
} = require("../../database/integrations-store");
const { jsonFileStore } = require("../../database/json-file-store");
const { readShippingStore } = require("../../database/shipping-store");
const { cloneDefaultSettingsDocument } = require("../settings/settings.model");
const {
  upsertCourierProfileForIntegration,
  deactivateCourierProfileForIntegration
} = require("../shipping/shipping.service");

const ALLOWED_CODES = new Set([
  "shiprocket", "delhivery", "shiprazor",
  "razorpay", "cashfree", "phonepe", "ccavenue", "payu", "paytm", "cod",
  "googleProductFeed", "facebookProductFeed", "facebookPixel",
  "googleAnalytics", "googleTagManager", "whatsapp", "abandonedCart",
  "commerceWatchdog", "aiContentAssistant", "claudeAssistant"
]);

function nowIso() {
  return new Date().toISOString();
}

function mergeIntegration(existing, patch) {
  const result = Object.assign({}, existing);
  for (const [key, val] of Object.entries(patch)) {
    if (key === "enabled") {
      result.enabled = Boolean(val);
    } else if (typeof val === "string") {
      result[key] = String(val).trim();
    } else if (typeof val === "number") {
      result[key] = Number(val);
    } else if (typeof val === "boolean") {
      result[key] = Boolean(val);
    }
  }
  return result;
}

// ── Courier helpers ────────────────────────────────────────────────────────────

function makeCourierId() {
  return `courier_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeCourier(raw) {
  const result = {
    id: String(raw.id || ""),
    name: String(raw.name || "").trim(),
    trackingUrl: String(raw.trackingUrl || "").trim(),
    trackingApiUrl: String(raw.trackingApiUrl || "").trim(),
    apiHeaders: (raw.apiHeaders && typeof raw.apiHeaders === "object" && !Array.isArray(raw.apiHeaders))
      ? raw.apiHeaders
      : {},
    phone: String(raw.phone || "").trim(),
    isActive: Boolean(raw.isActive ?? true),
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || null
  };
  if (raw._builtin) result._builtin = true;
  return result;
}

// ── Tracking response decoder ──────────────────────────────────────────────────

const STATUS_LABELS = {
  DELIVERED: "Delivered",
  OUT_FOR_DELIVERY: "Out for Delivery",
  IN_TRANSIT: "In Transit",
  INSCANNED_AT_CP: "Arrived at Delivery Center",
  INSCAN_AT_HUB: "Arrived at Hub",
  OUTSCAN_AT_HUB: "Departed from Hub",
  ORDER_CONFIRMED: "Order Confirmed",
  READY_FOR_DISPATCH: "Ready for Dispatch",
  PICKUP_DONE: "Pickup Done",
  PENDING: "Pending",
  CANCELLED: "Cancelled",
  RTO_INITIATED: "Return Initiated",
  RTO_DELIVERED: "Return Delivered",
  FAILED_DELIVERY: "Delivery Failed",
  UNDELIVERED: "Undelivered",
  LOST: "Lost / Damaged"
};

function normalizeCategory(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function decodeInnofulfill(data) {
  const info = data.orderInformation || {};
  const statuses = Array.isArray(data.statuses) ? data.statuses : [];
  const latest = statuses[0] || {};
  const category = normalizeCategory(latest.category || latest.status || "UNKNOWN");

  return {
    format: "innofulfill",
    trackingId: info.trackingId || "",
    currentStatus: category,
    currentStatusLabel: STATUS_LABELS[category] || latest.subcategory || latest.status || "Unknown",
    currentLocation: latest.location || "",
    isDelivered: category === "DELIVERED",
    origin: {
      city: info.sourceLocation?.city || "",
      state: info.sourceLocation?.state || "",
      pincode: info.sourceLocation?.pincode || ""
    },
    destination: {
      city: info.destinationLocation?.city || "",
      state: info.destinationLocation?.state || "",
      pincode: info.destinationLocation?.pincode || ""
    },
    sender: info.senderDetails?.sender_name || "",
    receiver: info.receiverDetails?.receiver_name || "",
    podLinks: Array.isArray(info.pod_links) ? info.pod_links : [],
    events: statuses.map((s) => {
      const cat = normalizeCategory(s.category || s.status);
      return {
        status: s.status || "",
        category: cat,
        label: s.subcategory || STATUS_LABELS[cat] || s.status || "",
        location: s.location || "",
        timestamp: s.statusTimestamp
          ? new Date(s.statusTimestamp).toISOString()
          : (s.createdAt || null),
        timestampMs: s.statusTimestamp || null
      };
    })
  };
}

function decodeGeneric(data) {
  const status = data.status || data.tracking_status || data.currentStatus || "UNKNOWN";
  const location = data.location || data.current_location || "";
  const rawEvents = data.events || data.history || data.tracking || data.Shipment?.Activity || [];
  const cat = normalizeCategory(status);

  return {
    format: "generic",
    trackingId: data.trackingId || data.awb || data.awbNumber || "",
    currentStatus: cat,
    currentStatusLabel: STATUS_LABELS[cat] || String(status),
    currentLocation: String(location),
    isDelivered: String(status).toLowerCase().includes("deliver"),
    origin: {},
    destination: {},
    podLinks: [],
    events: Array.isArray(rawEvents)
      ? rawEvents.map((e) => ({
          status: e.status || e.activity || e.Activity || "",
          category: normalizeCategory(e.category || e.status),
          label: e.description || e.subcategory || e.activity || e.Activity || e.status || "",
          location: e.location || e.Location || e.city || "",
          timestamp: e.timestamp || e.date || e.Date || e.createdAt || null,
          timestampMs: null
        }))
      : []
  };
}

function decodeCourierResponse(data) {
  if (!data || typeof data !== "object") {
    throw new HttpError(502, "Courier API returned an unexpected response format.");
  }
  if (data.orderInformation || Array.isArray(data.statuses)) {
    return decodeInnofulfill(data);
  }
  return decodeGeneric(data);
}

// ── External fetch helper ──────────────────────────────────────────────────────

async function fetchExternalJson(url, extraHeaders = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", ...extraHeaders },
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    throw new HttpError(502, `Could not reach courier API: ${err.message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(502, `Courier API returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(502, "Courier API returned non-JSON response.");
  }
}

// ── Tracking functions ────────────────────────────────────────────────────────

async function probeTracking({ trackingApiUrl, trackingId, apiHeaders }) {
  if (!trackingApiUrl) throw new HttpError(400, "Tracking API URL is required.");
  if (!trackingId) throw new HttpError(400, "Tracking ID is required.");

  const url = trackingApiUrl.replace(/\{trackingId\}/gi, encodeURIComponent(String(trackingId).trim()));
  const raw = await fetchExternalJson(url, apiHeaders || {});
  const decoded = decodeCourierResponse(raw);
  return { ...decoded, raw };
}

async function fetchCourierTracking(courierId, trackingId) {
  const couriers = await getCustomCouriers();
  const courier = couriers.find((c) => c.id === courierId);
  if (!courier) throw new HttpError(404, "Courier not found.");
  if (!courier.trackingApiUrl) throw new HttpError(400, `"${courier.name}" has no tracking API configured.`);

  const decoded = await probeTracking({
    trackingApiUrl: courier.trackingApiUrl,
    trackingId,
    apiHeaders: courier.apiHeaders || {}
  });
  return { courierId: courier.id, courierName: courier.name, ...decoded };
}

// ── Integrations CRUD ─────────────────────────────────────────────────────────

async function getAllIntegrations() {
  const store = await readIntegrationsStore();
  const defaults = cloneDefaultIntegrationsStore().integrations;
  const merged = {};
  for (const code of ALLOWED_CODES) {
    merged[code] = Object.assign({}, defaults[code] || {}, store.integrations?.[code] || {});
  }
  return {
    integrations: merged,
    customCouriers: Array.isArray(store.customCouriers) ? store.customCouriers : [],
    meta: store.meta
  };
}

async function getCustomCouriers() {
  const store = await readIntegrationsStore();
  const couriers = Array.isArray(store.customCouriers) ? store.customCouriers : [];

  // Self-heal: a courier added here should always be selectable from the
  // Mark-as-Packed courier dropdown, which reads shippingStore.courierProfiles
  // instead. Back-fill any courier that isn't mirrored there yet (covers both
  // couriers created before this sync existed, and any that fail to sync).
  const shippingStore = await readShippingStore();
  const linkedIds = new Set(
    ensureArray(shippingStore.courierProfiles)
      .map((profile) => profile.linkedIntegrationCourierId)
      .filter(Boolean)
  );
  const unsynced = couriers.filter((courier) => !linkedIds.has(courier.id));
  for (const courier of unsynced) {
    await upsertCourierProfileForIntegration(courier);
  }

  return couriers;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function addCustomCourier(data, adminEmail, actor = null) {
  const name = String(data?.name || "").trim();
  if (!name) throw new HttpError(400, "Courier name is required.");
  const store = await readIntegrationsStore();
  const newCourier = sanitizeCourier({
    id: makeCourierId(),
    name,
    trackingUrl: data.trackingUrl || "",
    trackingApiUrl: data.trackingApiUrl || "",
    apiHeaders: data.apiHeaders || {},
    phone: data.phone || "",
    isActive: data.isActive !== false
  });
  store.customCouriers.push(newCourier);
  store.meta = { updatedAt: nowIso(), updatedBy: adminEmail || "admin" };
  await writeIntegrationsStore(store);
  await upsertCourierProfileForIntegration(newCourier, actor);
  return newCourier;
}

async function updateCustomCourier(id, patch, adminEmail, actor = null) {
  if (!id) throw new HttpError(400, "Courier ID is required.");
  const store = await readIntegrationsStore();
  const idx = store.customCouriers.findIndex((c) => c.id === id);
  if (idx === -1) throw new HttpError(404, `Courier "${id}" not found.`);
  const current = store.customCouriers[idx];
  const updated = sanitizeCourier({
    ...current,
    name: patch.name !== undefined ? patch.name : current.name,
    trackingUrl: patch.trackingUrl !== undefined ? patch.trackingUrl : current.trackingUrl,
    trackingApiUrl: patch.trackingApiUrl !== undefined ? patch.trackingApiUrl : current.trackingApiUrl,
    apiHeaders: patch.apiHeaders !== undefined ? patch.apiHeaders : current.apiHeaders,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
    isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    updatedAt: nowIso()
  });
  store.customCouriers[idx] = updated;
  store.meta = { updatedAt: nowIso(), updatedBy: adminEmail || "admin" };
  await writeIntegrationsStore(store);
  await upsertCourierProfileForIntegration(updated, actor);
  return updated;
}

async function deleteCustomCourier(id, adminEmail, actor = null) {
  if (!id) throw new HttpError(400, "Courier ID is required.");
  const store = await readIntegrationsStore();
  const target = store.customCouriers.find((c) => c.id === id);
  if (!target) throw new HttpError(404, `Courier "${id}" not found.`);
  if (target._builtin) throw new HttpError(403, `"${target.name}" is a built-in courier and cannot be deleted.`);
  store.customCouriers = store.customCouriers.filter((c) => c.id !== id);
  store.meta = { updatedAt: nowIso(), updatedBy: adminEmail || "admin" };
  await writeIntegrationsStore(store);
  // Soft-deactivate rather than remove the mirrored courierProfile — it may
  // already be referenced by historical shipments/orders.
  await deactivateCourierProfileForIntegration(id, actor);
}

async function syncWhatsAppToPublicSettings(config) {
  try {
    const doc = await jsonFileStore.readSettingsDocument();
    if (!doc.contactInformation) {
      doc.contactInformation = cloneDefaultSettingsDocument().contactInformation;
    }
    const phoneNumber = config.enabled && config.enableLiveChat && config.phoneNumber
      ? String(config.phoneNumber).replace(/[^\d+]/g, "")
      : "";
    doc.contactInformation.publicWhatsApp = phoneNumber;
    await jsonFileStore.writeSettingsDocument(doc);
  } catch {
    // Non-critical sync — don't fail the main request
  }
}

async function updateIntegration(code, patch, adminEmail) {
  if (!ALLOWED_CODES.has(code)) {
    throw new HttpError(404, `Integration "${code}" not found.`);
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new HttpError(400, "Payload must be an object.");
  }
  const store = await readIntegrationsStore();
  const defaults = cloneDefaultIntegrationsStore().integrations;
  const current = Object.assign({}, defaults[code] || {}, store.integrations?.[code] || {});
  const updated = mergeIntegration(current, patch);
  store.integrations = store.integrations || {};
  store.integrations[code] = updated;
  store.meta = { updatedAt: nowIso(), updatedBy: adminEmail || "admin" };
  await writeIntegrationsStore(store);
  if (code === "whatsapp") {
    await syncWhatsAppToPublicSettings(updated);
  }
  return updated;
}

// ── Google OAuth admin config ─────────────────────────────────────────────────

async function getGoogleOAuthConfig() {
  const store = await readIntegrationsStore();
  const cfg = store.integrations?.googleOAuth || {};
  // Never expose clientSecret to the admin read response
  return {
    enabled: Boolean(cfg.enabled),
    clientId: cfg.clientId || "",
    hasSecret: Boolean(cfg.clientSecret)
  };
}

async function updateGoogleOAuthConfig(patch, adminEmail) {
  const store = await readIntegrationsStore();
  if (!store.integrations) store.integrations = {};
  const existing = store.integrations.googleOAuth || {};
  store.integrations.googleOAuth = {
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : Boolean(existing.enabled),
    clientId: patch.clientId !== undefined ? String(patch.clientId).trim() : (existing.clientId || ""),
    clientSecret: patch.clientSecret !== undefined ? String(patch.clientSecret).trim() : (existing.clientSecret || "")
  };
  store.meta = { updatedAt: nowIso(), updatedBy: adminEmail || "admin" };
  await writeIntegrationsStore(store);
  const saved = store.integrations.googleOAuth;
  return { enabled: saved.enabled, clientId: saved.clientId, hasSecret: Boolean(saved.clientSecret) };
}

module.exports = {
  getAllIntegrations,
  updateIntegration,
  getCustomCouriers,
  addCustomCourier,
  updateCustomCourier,
  deleteCustomCourier,
  probeTracking,
  fetchCourierTracking,
  getGoogleOAuthConfig,
  updateGoogleOAuthConfig
};
