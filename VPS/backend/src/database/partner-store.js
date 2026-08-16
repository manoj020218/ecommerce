const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { cloneDefaultPartnerStore } = require("../modules/partners/partners.model");

const partnerStorePath = path.resolve(process.cwd(), env.partnerStorePath);

let writeQueue = Promise.resolve();

async function ensurePartnerStoreFile() {
  const directoryPath = path.dirname(partnerStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(partnerStorePath);
  } catch (_error) {
    await fs.writeFile(
      partnerStorePath,
      JSON.stringify(cloneDefaultPartnerStore(), null, 2),
      "utf-8"
    );
  }
}

async function readPartnerStore() {
  await ensurePartnerStoreFile();
  const raw = await fs.readFile(partnerStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = partnerStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(partnerStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(partnerStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writePartnerStore(store) {
  const result = writeQueue.then(async () => {
    await ensurePartnerStoreFile();
    const tmpPath = partnerStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, partnerStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetPartnerStoreForRegression() {
  const fallback = cloneDefaultPartnerStore();
  await writePartnerStore(fallback);
  return fallback;
}

module.exports = {
  readPartnerStore,
  writePartnerStore,
  resetPartnerStoreForRegression
};
