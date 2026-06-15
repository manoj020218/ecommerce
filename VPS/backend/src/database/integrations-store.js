const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const integrationsStorePath = path.resolve(process.cwd(), env.integrationsStorePath);

// Built-in couriers that always exist and cannot be deleted.
// Add more here as the business grows.
const BUILTIN_COURIERS = Object.freeze([
  {
    id: "courier_builtin_shreemaruti",
    _builtin: true,
    name: "Shree Maruti Courier",
    phone: "1800-103-0400",
    trackingUrl: "https://www.shreemaruticourier.com/tracking.php?awb={trackingId}",
    trackingApiUrl: "https://apis-hubops.innofulfill.com/tracking/v2/{trackingId}",
    apiHeaders: {},
    isActive: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: null
  }
]);

const DEFAULT_INTEGRATIONS_STORE = Object.freeze({
  customCouriers: [],
  integrations: {
    shiprocket: { enabled: false, email: "", password: "", defaultWarehouse: "" },
    delhivery: { enabled: false, apiKey: "", warehouseName: "", clientName: "" },
    shiprazor: { enabled: false, apiKey: "" },
    razorpay: { enabled: false, keyId: "", keySecret: "", mode: "test" },
    cashfree: { enabled: false, appId: "", secretKey: "", mode: "test" },
    phonepe: { enabled: false, merchantId: "", saltKey: "", saltIndex: "1", mode: "test" },
    ccavenue: { enabled: false, merchantId: "", accessCode: "", workingKey: "", mode: "test" },
    payu: { enabled: false, merchantKey: "", merchantSalt: "", mode: "test" },
    paytm: { enabled: false, merchantId: "", merchantKey: "", website: "WEBSTAGING", mode: "test" },
    cod: { enabled: true },
    googleProductFeed: { enabled: false, merchantId: "" },
    facebookProductFeed: { enabled: false, pixelId: "", accessToken: "", catalogId: "" },
    facebookPixel: { enabled: false, pixelId: "" },
    googleAnalytics: { enabled: false, measurementId: "" },
    googleTagManager: { enabled: false, gtmId: "" },
    whatsapp: { enabled: false, phoneNumberId: "", accessToken: "", businessAccountId: "" },
    abandonedCart: { enabled: false, delayMinutes: 60, templateMessage: "" }
  },
  meta: { updatedAt: null, updatedBy: null }
});

function cloneDefaultIntegrationsStore() {
  return JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS_STORE));
}

// Merges any missing builtin couriers into the store's customCouriers array.
// Builtin couriers are always placed at the front, preserving user edits (isActive, etc.)
// Returns true if the store was modified (so caller can decide to persist).
function mergeBuiltinCouriers(store) {
  let dirty = false;
  const existingIds = new Set(store.customCouriers.map((c) => c.id));
  for (const builtin of [...BUILTIN_COURIERS].reverse()) {
    if (!existingIds.has(builtin.id)) {
      store.customCouriers.unshift({ ...builtin });
      dirty = true;
    }
  }
  return dirty;
}

async function ensureIntegrationsStoreFile() {
  const dir = path.dirname(integrationsStorePath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(integrationsStorePath);
  } catch {
    const fresh = cloneDefaultIntegrationsStore();
    mergeBuiltinCouriers(fresh);
    await fs.writeFile(integrationsStorePath, JSON.stringify(fresh, null, 2), "utf-8");
  }
}

async function readIntegrationsStore() {
  await ensureIntegrationsStoreFile();
  const raw = await fs.readFile(integrationsStorePath, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = cloneDefaultIntegrationsStore();
    mergeBuiltinCouriers(parsed);
    await fs.writeFile(integrationsStorePath, JSON.stringify(parsed, null, 2), "utf-8");
    return parsed;
  }

  // Migrate stores that predate customCouriers
  if (!Array.isArray(parsed.customCouriers)) {
    parsed.customCouriers = [];
  }

  // Auto-add any missing builtin couriers (e.g. new entries added in code)
  const dirty = mergeBuiltinCouriers(parsed);
  if (dirty) {
    await fs.writeFile(integrationsStorePath, JSON.stringify(parsed, null, 2), "utf-8");
  }

  return parsed;
}

async function writeIntegrationsStore(store) {
  await ensureIntegrationsStoreFile();
  await fs.writeFile(integrationsStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
}

module.exports = {
  BUILTIN_COURIERS,
  cloneDefaultIntegrationsStore,
  readIntegrationsStore,
  writeIntegrationsStore
};
