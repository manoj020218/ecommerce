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
  } catch (_error) {
    const fallback = cloneDefaultCatalogStore();
    await fs.writeFile(catalogStorePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeCatalogStore(store) {
  await ensureCatalogStoreFile();
  await fs.writeFile(catalogStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
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
