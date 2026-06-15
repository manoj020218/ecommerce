const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const integrationsStorePath = path.resolve(process.cwd(), env.integrationsStorePath);

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

async function ensureIntegrationsStoreFile() {
  const dir = path.dirname(integrationsStorePath);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(integrationsStorePath);
  } catch {
    await fs.writeFile(
      integrationsStorePath,
      JSON.stringify(cloneDefaultIntegrationsStore(), null, 2),
      "utf-8"
    );
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
    await fs.writeFile(integrationsStorePath, JSON.stringify(parsed, null, 2), "utf-8");
    return parsed;
  }
  // Migrate existing stores that predate customCouriers
  if (!Array.isArray(parsed.customCouriers)) {
    parsed.customCouriers = [];
  }
  return parsed;
}

async function writeIntegrationsStore(store) {
  await ensureIntegrationsStoreFile();
  await fs.writeFile(integrationsStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
}

module.exports = {
  cloneDefaultIntegrationsStore,
  readIntegrationsStore,
  writeIntegrationsStore
};
