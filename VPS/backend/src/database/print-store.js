const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");
const { cloneDefaultPrintStore } = require("../modules/print-uploads/print-uploads.model");

const printStorePath = path.resolve(process.cwd(), env.printStorePath);

let writeQueue = Promise.resolve();

async function ensurePrintStoreFile() {
  const directoryPath = path.dirname(printStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(printStorePath);
  } catch (_error) {
    await fs.writeFile(
      printStorePath,
      JSON.stringify(cloneDefaultPrintStore(), null, 2),
      "utf-8"
    );
  }
}

async function readPrintStore() {
  await ensurePrintStoreFile();
  const raw = await fs.readFile(printStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = printStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(printStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(printStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writePrintStore(store) {
  const result = writeQueue.then(async () => {
    await ensurePrintStoreFile();
    const tmpPath = printStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, printStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetPrintStoreForRegression() {
  const fallback = cloneDefaultPrintStore();
  await writePrintStore(fallback);
  return fallback;
}

module.exports = {
  readPrintStore,
  writePrintStore,
  resetPrintStoreForRegression
};
