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

async function getAllIntegrations() {
  const store = await readIntegrationsStore();
  const defaults = cloneDefaultIntegrationsStore().integrations;
  const merged = {};
  for (const code of ALLOWED_CODES) {
    merged[code] = Object.assign({}, defaults[code] || {}, store.integrations?.[code] || {});
  }
  return { integrations: merged, meta: store.meta };
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

module.exports = { getAllIntegrations, updateIntegration };
