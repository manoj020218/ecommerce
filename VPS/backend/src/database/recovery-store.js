const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const recoveryStorePath = path.resolve(process.cwd(), env.recoveryStorePath);

let writeQueue = Promise.resolve();

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
  } catch (parseError) {
    const backupPath = recoveryStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(recoveryStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(recoveryStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeRecoveryStore(store) {
  const result = writeQueue.then(async () => {
    await ensureRecoveryStoreFile();
    const tmpPath = recoveryStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, recoveryStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
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
