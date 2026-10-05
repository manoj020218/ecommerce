const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { createReadOnlySnapshot } = require("./read-only-snapshot");

const authStorePath = path.resolve(process.cwd(), env.authStorePath);

const DEFAULT_AUTH_STORE = Object.freeze({
  users: [],
  staffUsers: [],
  permissionGroups: [],
  refreshSessions: [],
  otpChallenges: [],
  passwordResetRequests: [],
  guestCarts: [],
  userCarts: [],
  cartShares: [],
  stockReservations: [],
  checkoutSessions: [],
  paymentAttempts: [],
  quoteRequests: [],
  orders: [],
  activityLogs: []
});

// Mutex to prevent concurrent writes from corrupting the JSON file
let writeQueue = Promise.resolve();

// This only serializes the disk write itself. It does NOT cover the
// read -> mutate in memory -> write cycle every cart/checkout mutation
// actually needs: two near-simultaneous requests (double-tap "add to cart",
// a qty change firing close to another tab's edit) can both readAuthStore()
// against the same pre-mutation snapshot, mutate their own in-memory copies
// independently, and whichever writeAuthStore() lands second silently
// overwrites the first's change -- a classic lost-update race. This second,
// broader mutex is for callers that need the whole cycle serialized, not
// just the write.
let cartMutationLock = Promise.resolve();

function withAuthStoreLock(fn) {
  const resultPromise = cartMutationLock.then(fn, fn);
  cartMutationLock = resultPromise.then(
    () => {},
    () => {}
  );
  return resultPromise;
}

function cloneDefaultAuthStore() {
  return JSON.parse(JSON.stringify(DEFAULT_AUTH_STORE));
}

async function ensureAuthStoreFile() {
  const directoryPath = path.dirname(authStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(authStorePath);
  } catch (_error) {
    await fs.writeFile(
      authStorePath,
      JSON.stringify(cloneDefaultAuthStore(), null, 2),
      "utf-8"
    );
  }
}

async function readAuthStore() {
  await ensureAuthStoreFile();
  const raw = await fs.readFile(authStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = authStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(authStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error("auth-store.json is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Original error: " + parseError.message);
  }
}

// Read-only shared snapshot (2026-10-04) — see read-only-snapshot.js. Used
// only by read-only hot paths (guest GET /api/cart). Anything that modifies
// the auth store must keep using readAuthStore() (fresh private copy).
const authSnapshot = createReadOnlySnapshot({
  filePath: authStorePath,
  readFresh: readAuthStore,
  label: "auth store"
});
const readAuthStoreSnapshot = authSnapshot.read;
const invalidateAuthSnapshot = authSnapshot.invalidate;

async function writeAuthStore(store) {
  invalidateAuthSnapshot();
  const result = writeQueue.then(async () => {
    await ensureAuthStoreFile();
    const tmpPath = authStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, authStorePath);
    invalidateAuthSnapshot(); // again once the file is replaced
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetAuthStoreForRegression() {
  const fallback = cloneDefaultAuthStore();
  await writeAuthStore(fallback);
  return fallback;
}

module.exports = {
  cloneDefaultAuthStore,
  readAuthStore,
  readAuthStoreSnapshot,
  invalidateAuthSnapshot,
  writeAuthStore,
  resetAuthStoreForRegression,
  withAuthStoreLock
};
