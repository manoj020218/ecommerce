const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const catalogStorePath = path.resolve(process.cwd(), env.catalogStorePath);

const DEFAULT_CATALOG_STORE = Object.freeze({
  categories: [],
  hsnTaxMaster: [],
  products: [],
  inventoryMovements: []
});

// Mutex to prevent concurrent writes from corrupting the JSON file
let writeQueue = Promise.resolve();

function cloneDefaultCatalogStore() {
  return JSON.parse(JSON.stringify(DEFAULT_CATALOG_STORE));
}

async function ensureCatalogStoreFile() {
  const directoryPath = path.dirname(catalogStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(catalogStorePath);
  } catch (_error) {
    await fs.writeFile(
      catalogStorePath,
      JSON.stringify(cloneDefaultCatalogStore(), null, 2),
      "utf-8"
    );
  }
}

async function readCatalogStore() {
  await ensureCatalogStoreFile();
  const raw = await fs.readFile(catalogStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    // DO NOT overwrite the file here — preserve the corrupted file as a backup
    // so data can potentially be recovered. Throw instead.
    const backupPath = catalogStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(catalogStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error("catalog-store.json is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Original error: " + parseError.message);
  }
}

async function writeCatalogStore(store) {
  // Serialize writes through a queue to prevent concurrent-write race conditions
  const result = writeQueue.then(async () => {
    await ensureCatalogStoreFile();
    // Atomic write: write to a temp file first, then rename over the real file.
    // If the write crashes halfway, the original file is untouched.
    const tmpPath = catalogStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, catalogStorePath);
    return store;
  });
  writeQueue = result.catch(() => { /* keep queue moving even on error */ });
  return result;
}

async function resetCatalogStoreForRegression() {
  const fallback = cloneDefaultCatalogStore();
  await writeCatalogStore(fallback);
  return fallback;
}

module.exports = {
  readCatalogStore,
  writeCatalogStore,
  resetCatalogStoreForRegression
};
