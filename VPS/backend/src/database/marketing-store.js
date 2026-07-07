const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { cloneDefaultMarketingStore } = require("../modules/marketing/marketing.model");

const marketingStorePath = path.resolve(process.cwd(), env.marketingStorePath);

let writeQueue = Promise.resolve();

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
  } catch (parseError) {
    const backupPath = marketingStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(marketingStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(marketingStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeMarketingStore(store) {
  const result = writeQueue.then(async () => {
    await ensureMarketingStoreFile();
    const tmpPath = marketingStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, marketingStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
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
