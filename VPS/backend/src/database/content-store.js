const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { cloneDefaultContentStore } = require("../modules/blogs/blogs.model");

const contentStorePath = path.resolve(process.cwd(), env.contentStorePath);

let writeQueue = Promise.resolve();

async function ensureContentStoreFile() {
  const directoryPath = path.dirname(contentStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(contentStorePath);
  } catch (_error) {
    await fs.writeFile(
      contentStorePath,
      JSON.stringify(cloneDefaultContentStore(), null, 2),
      "utf-8"
    );
  }
}

async function readContentStore() {
  await ensureContentStoreFile();
  const raw = await fs.readFile(contentStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = contentStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(contentStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(contentStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeContentStore(store) {
  const result = writeQueue.then(async () => {
    await ensureContentStoreFile();
    const tmpPath = contentStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, contentStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetContentStoreForRegression() {
  const fallback = cloneDefaultContentStore();
  await writeContentStore(fallback);
  return fallback;
}

module.exports = {
  readContentStore,
  writeContentStore,
  resetContentStoreForRegression
};
