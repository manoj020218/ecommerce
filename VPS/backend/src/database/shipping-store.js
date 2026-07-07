const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const shippingStorePath = path.resolve(process.cwd(), env.shippingStorePath);

const DEFAULT_SHIPPING_STORE = Object.freeze({
  settings: {
    originStateCode: "DL",
    localPincodePrefixes: ["110"],
    remotePincodePrefixes: ["737", "744", "791", "792", "793", "794", "795", "796", "798", "799"],
    remoteExtraChargeByMethod: {
      standard: 80,
      express: 140,
      local_pickup: 0,
      self_pickup: 0,
      transport: 110,
      manual_delivery: 70
    },
    zoneStateMap: {
      north_india: ["DL", "HR", "PB", "UP", "UK", "HP", "JK", "CH", "RJ"],
      west_india: ["GJ", "MH", "GA", "DN", "DD"],
      south_india: ["KA", "TN", "KL", "AP", "TS", "PY"],
      north_east_remote: ["AS", "AR", "ML", "MN", "MZ", "NL", "SK", "TR", "AN", "LD"]
    }
  },
  rateCards: [
    {
      id: "shiprate_standard_local",
      shippingMethod: "standard",
      zone: "local",
      baseCharge: 40,
      perKgCharge: 16,
      isActive: true
    },
    {
      id: "shiprate_standard_state",
      shippingMethod: "standard",
      zone: "state",
      baseCharge: 60,
      perKgCharge: 20,
      isActive: true
    },
    {
      id: "shiprate_standard_north_india",
      shippingMethod: "standard",
      zone: "north_india",
      baseCharge: 80,
      perKgCharge: 24,
      isActive: true
    },
    {
      id: "shiprate_standard_west_india",
      shippingMethod: "standard",
      zone: "west_india",
      baseCharge: 90,
      perKgCharge: 24,
      isActive: true
    },
    {
      id: "shiprate_standard_south_india",
      shippingMethod: "standard",
      zone: "south_india",
      baseCharge: 95,
      perKgCharge: 25,
      isActive: true
    },
    {
      id: "shiprate_standard_north_east_remote",
      shippingMethod: "standard",
      zone: "north_east_remote",
      baseCharge: 130,
      perKgCharge: 34,
      isActive: true
    },
    {
      id: "shiprate_standard_all_india",
      shippingMethod: "standard",
      zone: "all_india",
      baseCharge: 100,
      perKgCharge: 28,
      isActive: true
    },
    {
      id: "shiprate_express_local",
      shippingMethod: "express",
      zone: "local",
      baseCharge: 70,
      perKgCharge: 25,
      isActive: true
    },
    {
      id: "shiprate_express_state",
      shippingMethod: "express",
      zone: "state",
      baseCharge: 100,
      perKgCharge: 30,
      isActive: true
    },
    {
      id: "shiprate_express_north_india",
      shippingMethod: "express",
      zone: "north_india",
      baseCharge: 120,
      perKgCharge: 34,
      isActive: true
    },
    {
      id: "shiprate_express_west_india",
      shippingMethod: "express",
      zone: "west_india",
      baseCharge: 130,
      perKgCharge: 34,
      isActive: true
    },
    {
      id: "shiprate_express_south_india",
      shippingMethod: "express",
      zone: "south_india",
      baseCharge: 145,
      perKgCharge: 36,
      isActive: true
    },
    {
      id: "shiprate_express_north_east_remote",
      shippingMethod: "express",
      zone: "north_east_remote",
      baseCharge: 180,
      perKgCharge: 46,
      isActive: true
    },
    {
      id: "shiprate_express_all_india",
      shippingMethod: "express",
      zone: "all_india",
      baseCharge: 150,
      perKgCharge: 38,
      isActive: true
    },
    {
      id: "shiprate_local_pickup_all_india",
      shippingMethod: "local_pickup",
      zone: "all_india",
      baseCharge: 0,
      perKgCharge: 0,
      isActive: true
    },
    {
      id: "shiprate_self_pickup_all_india",
      shippingMethod: "self_pickup",
      zone: "all_india",
      baseCharge: 0,
      perKgCharge: 0,
      isActive: true
    },
    {
      id: "shiprate_transport_all_india",
      shippingMethod: "transport",
      zone: "all_india",
      baseCharge: 120,
      perKgCharge: 19,
      isActive: true
    },
    {
      id: "shiprate_manual_delivery_all_india",
      shippingMethod: "manual_delivery",
      zone: "all_india",
      baseCharge: 85,
      perKgCharge: 14,
      isActive: true
    }
  ],
  shippingClasses: [
    {
      id: "sc_normal",
      name: "Normal",
      code: "normal",
      description: "Standard weight-based shipping using rate cards.",
      rateType: "weight_based",
      fixedAmount: 0,
      baseCharge: 0,
      perKgRate: 0,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  courierProfiles: [],
  shipments: [],
  trackingEmailLogs: []
});

let writeQueue = Promise.resolve();

function cloneDefaultShippingStore() {
  return JSON.parse(JSON.stringify(DEFAULT_SHIPPING_STORE));
}

async function ensureShippingStoreFile() {
  const directoryPath = path.dirname(shippingStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(shippingStorePath);
  } catch (_error) {
    await fs.writeFile(
      shippingStorePath,
      JSON.stringify(cloneDefaultShippingStore(), null, 2),
      "utf-8"
    );
  }
}

async function readShippingStore() {
  await ensureShippingStoreFile();
  const raw = await fs.readFile(shippingStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = shippingStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(shippingStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(shippingStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeShippingStore(store) {
  const result = writeQueue.then(async () => {
    await ensureShippingStoreFile();
    const tmpPath = shippingStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, shippingStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetShippingStoreForRegression() {
  const fallback = cloneDefaultShippingStore();
  await writeShippingStore(fallback);
  return fallback;
}

module.exports = {
  cloneDefaultShippingStore,
  readShippingStore,
  writeShippingStore,
  resetShippingStoreForRegression
};
