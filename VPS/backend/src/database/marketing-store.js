const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { cloneDefaultMarketingStore } = require("../modules/marketing/marketing.model");

const marketingStorePath = path.resolve(process.cwd(), env.marketingStorePath);

async function ensureMarketingStoreFile() {
  const directoryPath = path.dirname(marketingStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(marketingStorePath);
  } catch (_error) {
    await fs.writeFile(
      marketingStorePath,
      JSON.stringify(cloneDefaultMarketingStore(), null, 2),
      "utf-8"
    );
  }
}

async function readMarketingStore() {
  await ensureMarketingStoreFile();
  const raw = await fs.readFile(marketingStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const fallback = cloneDefaultMarketingStore();
    await fs.writeFile(marketingStorePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeMarketingStore(store) {
  await ensureMarketingStoreFile();
  await fs.writeFile(marketingStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
}

async function resetMarketingStoreForRegression() {
  const fallback = cloneDefaultMarketingStore();
  await writeMarketingStore(fallback);
  return fallback;
}

module.exports = {
  readMarketingStore,
  writeMarketingStore,
  resetMarketingStoreForRegression
};
