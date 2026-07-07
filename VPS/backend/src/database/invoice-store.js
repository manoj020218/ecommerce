const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const invoiceStorePath = path.resolve(process.cwd(), env.invoiceStorePath);

let writeQueue = Promise.resolve();

const DEFAULT_INVOICE_STORE = Object.freeze({
  invoices: [],
  sequences: [],
  tallyExports: []
});

function cloneDefaultInvoiceStore() {
  return JSON.parse(JSON.stringify(DEFAULT_INVOICE_STORE));
}

async function ensureInvoiceStoreFile() {
  const directoryPath = path.dirname(invoiceStorePath);
  await fs.mkdir(directoryPath, { recursive: true });

  try {
    await fs.access(invoiceStorePath);
  } catch (_error) {
    await fs.writeFile(
      invoiceStorePath,
      JSON.stringify(cloneDefaultInvoiceStore(), null, 2),
      "utf-8"
    );
  }
}

async function readInvoiceStore() {
  await ensureInvoiceStoreFile();
  const raw = await fs.readFile(invoiceStorePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    const backupPath = invoiceStorePath + ".corrupted." + Date.now();
    try { await fs.copyFile(invoiceStorePath, backupPath); } catch (_) { /* best effort */ }
    throw new Error(invoiceStorePath + " is corrupted (JSON parse failed). Backup saved to: " + backupPath + ". Error: " + parseError.message);
  }
}

async function writeInvoiceStore(store) {
  const result = writeQueue.then(async () => {
    await ensureInvoiceStoreFile();
    const tmpPath = invoiceStorePath + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tmpPath, invoiceStorePath);
    return store;
  });
  writeQueue = result.catch(() => { });
  return result;
}

async function resetInvoiceStoreForRegression() {
  const fallback = cloneDefaultInvoiceStore();
  await writeInvoiceStore(fallback);
  return fallback;
}

module.exports = {
  cloneDefaultInvoiceStore,
  readInvoiceStore,
  writeInvoiceStore,
  resetInvoiceStoreForRegression
};
