const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

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

async function writeAuthStore(store) {
  const result = writeQueue.then(async () => {
    await ensureAuthStoreFile();
    const tmpPath = authStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, authStorePath);
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
  writeAuthStore,
  resetAuthStoreForRegression
};
