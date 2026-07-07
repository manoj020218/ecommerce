const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const {
  cloneDefaultWebsiteLeadsStore
} = require("../modules/website-leads/website-leads.model");

const websiteLeadsStorePath = path.resolve(process.cwd(), env.websiteLeadsStorePath);

let writeQueue = Promise.resolve();

async function ensureWebsiteLeadsStoreFile() {
  const directoryPath = path.dirname(websiteLeadsStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(websiteLeadsStorePath);
  } catch (_error) {
    await fs.writeFile(
      websiteLeadsStorePath,
      JSON.stringify(cloneDefaultWebsiteLeadsStore(), null, 2),
      "utf-8"
    );
  }
}

async function readWebsiteLeadsStore() {
  await ensureWebsiteLeadsStoreFile();
  const raw = await fs.readFile(websiteLeadsStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = websiteLeadsStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(websiteLeadsStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(websiteLeadsStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeWebsiteLeadsStore(store) {
  const result = writeQueue.then(async () => {
    await ensureWebsiteLeadsStoreFile();
    const tmpPath = websiteLeadsStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, websiteLeadsStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetWebsiteLeadsStoreForRegression() {
  const fallback = cloneDefaultWebsiteLeadsStore();
  await writeWebsiteLeadsStore(fallback);
  return fallback;
}

module.exports = {
  readWebsiteLeadsStore,
  writeWebsiteLeadsStore,
  resetWebsiteLeadsStoreForRegression
};
