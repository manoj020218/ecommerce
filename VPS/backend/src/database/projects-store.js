const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

// "Projects / Solutions" (custom IoT projects sold on quotation) and their
// enquiries (2026-09-28). Small store: a handful of project pages plus
// enquiries, which grow slowly (one per real enquiry, never per page view).
// Same atomic-write + write-queue pattern as the other JSON stores.

const projectsStorePath = path.resolve(process.cwd(), env.projectsStorePath);

let writeQueue = Promise.resolve();

function cloneDefaultProjectsStore() {
  return { projects: [], enquiries: [] };
}

async function ensureProjectsStoreFile() {
  await fs.mkdir(path.dirname(projectsStorePath), { recursive: true });
  try {
    await fs.access(projectsStorePath);
  } catch (_error) {
    await fs.writeFile(projectsStorePath, JSON.stringify(cloneDefaultProjectsStore(), null, 2), "utf-8");
  }
}

async function readProjectsStore() {
  await ensureProjectsStoreFile();
  const raw = await fs.readFile(projectsStorePath, "utf-8");
  let store;
  try {
    store = JSON.parse(raw);
  } catch (parseError) {
    const backupPath = projectsStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(projectsStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(projectsStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
  if (!Array.isArray(store.projects)) store.projects = [];
  if (!Array.isArray(store.enquiries)) store.enquiries = [];
  return store;
}

async function writeProjectsStore(store) {
  const result = writeQueue.then(async () => {
    await ensureProjectsStoreFile();
    const tmpPath = projectsStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, projectsStorePath);
    return store;
  });
  writeQueue = result.catch(() => {});
  return result;
}

module.exports = { readProjectsStore, writeProjectsStore, cloneDefaultProjectsStore };
