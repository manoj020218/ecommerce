const fs = require("node:fs/promises");
const path = require("node:path");
const { env } = require("../config/env");

const invoiceStorePath = path.resolve(process.cwd(), env.invoiceStorePath);

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
  } catch (_error) {
    const fallback = cloneDefaultInvoiceStore();
    await fs.writeFile(invoiceStorePath, JSON.stringify(fallback, null, 2), "utf-8");
    return fallback;
  }
}

async function writeInvoiceStore(store) {
  await ensureInvoiceStoreFile();
  await fs.writeFile(invoiceStorePath, JSON.stringify(store, null, 2), "utf-8");
  return store;
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
