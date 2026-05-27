const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { cloneDefaultContentStore } = require("../modules/blogs/blogs.model");

const contentStorePath = path.resolve(process.cwd(), env.contentStorePath);

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
  } catch (_error) {
    const fallback = cloneDefaultContentStore();
    await fs.writeFile(contentStorePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeContentStore(store) {
  await ensureContentStoreFile();
  await fs.writeFile(contentStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
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
