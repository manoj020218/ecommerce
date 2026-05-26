const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const searchStorePath = path.resolve(process.cwd(), env.searchStorePath);

const DEFAULT_SEARCH_STORE = Object.freeze({
  searchSynonyms: [],
  buyerPhraseMappings: [],
  productKeywordMappings: [],
  searchRedirects: [],
  searchLogs: [],
  userSearchHistory: [],
  userViewHistory: [],
  productSearchSignals: [],
  reindexMeta: {
    lastReindexedAt: null,
    indexedProductCount: 0,
    indexedActiveProductCount: 0,
    note: "Phase 5 search index metadata."
  }
});

function cloneDefaultSearchStore() {
  return JSON.parse(JSON.stringify(DEFAULT_SEARCH_STORE));
}

async function ensureSearchStoreFile() {
  const directoryPath = path.dirname(searchStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(searchStorePath);
  } catch (_error) {
    await fs.writeFile(
      searchStorePath,
      JSON.stringify(cloneDefaultSearchStore(), null, 2),
      "utf-8"
    );
  }
}

async function readSearchStore() {
  await ensureSearchStoreFile();
  const raw = await fs.readFile(searchStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const fallback = cloneDefaultSearchStore();
    await fs.writeFile(searchStorePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeSearchStore(store) {
  await ensureSearchStoreFile();
  await fs.writeFile(searchStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
}

async function resetSearchStoreForRegression() {
  const fallback = cloneDefaultSearchStore();
  await writeSearchStore(fallback);
  return fallback;
}

module.exports = {
  readSearchStore,
  writeSearchStore,
  resetSearchStoreForRegression
};
