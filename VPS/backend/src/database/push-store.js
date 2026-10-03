const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

// App push notifications (2026-10-03): the server's VAPID key pair (made once,
// on first use), each phone's push subscription, and a capped log of sent
// notifications (shown in My Account → Notifications).
// Same atomic-write pattern as the other JSON stores, plus updatePushStore()
// which serialises the whole read → change → write cycle, because subscribes,
// sends and dead-subscription clean-up can overlap.

const pushStorePath = path.resolve(process.cwd(), env.pushStorePath);

let writeQueue = Promise.resolve();
let updateLock = Promise.resolve();

function cloneDefaultPushStore() {
  return { vapid: null, subscriptions: [], notifications: [] };
}

async function ensurePushStoreFile() {
  await fs.mkdir(path.dirname(pushStorePath), { recursive: true });
  try {
    await fs.access(pushStorePath);
  } catch (_error) {
    await fs.writeFile(pushStorePath, JSON.stringify(cloneDefaultPushStore(), null, 2), "utf-8");
  }
}

async function readPushStore() {
  await ensurePushStoreFile();
  const raw = await fs.readFile(pushStorePath, "utf-8");
  let store;
  try {
    store = JSON.parse(raw);
  } catch (parseError) {
    const backupPath = pushStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(pushStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(pushStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
  if (!Array.isArray(store.subscriptions)) store.subscriptions = [];
  if (!Array.isArray(store.notifications)) store.notifications = [];
  if (store.vapid === undefined) store.vapid = null;
  return store;
}

async function writePushStore(store) {
  const result = writeQueue.then(async () => {
    await ensurePushStoreFile();
    const tmpPath = pushStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, pushStorePath);
    return store;
  });
  writeQueue = result.catch(() => {});
  return result;
}

// mutator(store) may change the store and return a value; the change is saved.
function updatePushStore(mutator) {
  const run = async () => {
    const store = await readPushStore();
    const value = await mutator(store);
    await writePushStore(store);
    return value;
  };
  const result = updateLock.then(run, run);
  updateLock = result.then(() => {}, () => {});
  return result;
}

module.exports = { readPushStore, writePushStore, updatePushStore, cloneDefaultPushStore };
