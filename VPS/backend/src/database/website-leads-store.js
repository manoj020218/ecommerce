const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const {
  cloneDefaultWebsiteLeadsStore
} = require("../modules/website-leads/website-leads.model");

const websiteLeadsStorePath = path.resolve(process.cwd(), env.websiteLeadsStorePath);

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
  } catch (_error) {
    const fallback = cloneDefaultWebsiteLeadsStore();
    await fs.writeFile(
      websiteLeadsStorePath,
      JSON.stringify(fallback, null, 2),
      "utf-8"
    );
    return fallback;
  }
}

async function writeWebsiteLeadsStore(store) {
  await ensureWebsiteLeadsStoreFile();
  await fs.writeFile(websiteLeadsStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
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
