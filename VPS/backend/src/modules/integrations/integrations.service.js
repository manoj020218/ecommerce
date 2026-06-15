const { HttpError } = require("../../common/http-error");
const {
  cloneDefaultIntegrationsStore,
  readIntegrationsStore,
  writeIntegrationsStore
} = require("../../database/integrations-store");

const ALLOWED_CODES = new Set([
  "shiprocket", "delhivery", "shiprazor",
  "razorpay", "cashfree", "phonepe", "ccavenue", "payu", "paytm", "cod",
  "googleProductFeed", "facebookProductFeed", "facebookPixel",
  "googleAnalytics", "googleTagManager", "whatsapp", "abandonedCart"
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

function makeCourierId() {
  return `courier_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeCourier(raw) {
  return {
    id: String(raw.id || ""),
    name: String(raw.name || "").trim(),
    trackingUrl: String(raw.trackingUrl || "").trim(),
    phone: String(raw.phone || "").trim(),
    isActive: Boolean(raw.isActive ?? true),
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || null
  };
}

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
  return Array.isArray(store.customCouriers) ? store.customCouriers : [];
}

async function addCustomCourier(data, adminEmail) {
  const name = String(data?.name || "").trim();
  if (!name) throw new HttpError(400, "Courier name is required.");
  const store = await readIntegrationsStore();
  const newCourier = sanitizeCourier({
    id: makeCourierId(),
    name,
    trackingUrl: data.trackingUrl || "",
    phone: data.phone || "",
    isActive: data.isActive !== false
  });
  store.customCouriers.push(newCourier);
  store.meta = { updatedAt: nowIso(), updatedBy: adminEmail || "admin" };
  await writeIntegrationsStore(store);
  return newCourier;
}

async function updateCustomCourier(id, patch, adminEmail) {
  if (!id) throw new HttpError(400, "Courier ID is required.");
  const store = await readIntegrationsStore();
  const idx = store.customCouriers.findIndex((c) => c.id === id);
  if (idx === -1) throw new HttpError(404, `Courier "${id}" not found.`);
  const current = store.customCouriers[idx];
  const updated = sanitizeCourier({
    ...current,
    name: patch.name !== undefined ? patch.name : current.name,
    trackingUrl: patch.trackingUrl !== undefined ? patch.trackingUrl : current.trackingUrl,
    phone: patch.phone !== undefined ? patch.phone : current.phone,
    isActive: patch.isActive !== undefined ? patch.isActive : current.isActive,
    updatedAt: nowIso()
  });
  store.customCouriers[idx] = updated;
  store.meta = { updatedAt: nowIso(), updatedBy: adminEmail || "admin" };
  await writeIntegrationsStore(store);
  return updated;
}

async function deleteCustomCourier(id, adminEmail) {
  if (!id) throw new HttpError(400, "Courier ID is required.");
  const store = await readIntegrationsStore();
  const before = store.customCouriers.length;
  store.customCouriers = store.customCouriers.filter((c) => c.id !== id);
  if (store.customCouriers.length === before) {
    throw new HttpError(404, `Courier "${id}" not found.`);
  }
  store.meta = { updatedAt: nowIso(), updatedBy: adminEmail || "admin" };
  await writeIntegrationsStore(store);
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
  return updated;
}

module.exports = {
  getAllIntegrations,
  updateIntegration,
  getCustomCouriers,
  addCustomCourier,
  updateCustomCourier,
  deleteCustomCourier
};
