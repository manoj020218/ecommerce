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
  } catch (_error) {
    const fallback = cloneDefaultAuthStore();
    await fs.writeFile(authStorePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeAuthStore(store) {
  await ensureAuthStoreFile();
  await fs.writeFile(authStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
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
