const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const recoveryStorePath = path.resolve(process.cwd(), env.recoveryStorePath);

const DEFAULT_RECOVERY_STORE = Object.freeze({
  recoveries: []
});

function cloneDefaultRecoveryStore() {
  return JSON.parse(JSON.stringify(DEFAULT_RECOVERY_STORE));
}

async function ensureRecoveryStoreFile() {
  const directoryPath = path.dirname(recoveryStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(recoveryStorePath);
  } catch (_error) {
    await fs.writeFile(
      recoveryStorePath,
      JSON.stringify(cloneDefaultRecoveryStore(), null, 2),
      "utf-8"
    );
  }
}

async function readRecoveryStore() {
  await ensureRecoveryStoreFile();
  const raw = await fs.readFile(recoveryStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const fallback = cloneDefaultRecoveryStore();
    await fs.writeFile(recoveryStorePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeRecoveryStore(store) {
  await ensureRecoveryStoreFile();
  await fs.writeFile(recoveryStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
}

async function resetRecoveryStoreForRegression() {
  const fallback = cloneDefaultRecoveryStore();
  await writeRecoveryStore(fallback);
  return fallback;
}

module.exports = {
  cloneDefaultRecoveryStore,
  readRecoveryStore,
  writeRecoveryStore,
  resetRecoveryStoreForRegression
};
