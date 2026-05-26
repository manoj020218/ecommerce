const { HttpError } = require("../../common/http-error");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { sanitizeHsnRecord } = require("./hsn-tax.model");

function normalizeHsnCode(hsnCode) {
  return hsnCode.trim().toUpperCase();
}

function parseEffectiveDate(effectiveFrom) {
  const parsed = Date.parse(effectiveFrom);
  if (Number.isNaN(parsed)) {
    throw new HttpError(400, "Invalid effectiveFrom date.");
  }
  return new Date(parsed).toISOString();
}

function normalizeRates(payload) {
  const gstRate = Number(payload.gstRate);
  const cgstRate =
    payload.cgstRate === undefined
      ? Number((gstRate / 2).toFixed(2))
      : Number(payload.cgstRate);
  const sgstRate =
    payload.sgstRate === undefined
      ? Number((gstRate / 2).toFixed(2))
      : Number(payload.sgstRate);
  const igstRate = payload.igstRate === undefined ? gstRate : Number(payload.igstRate);

  const combinedLocal = Number((cgstRate + sgstRate).toFixed(2));
  const normalizedGst = Number(gstRate.toFixed(2));

  if (combinedLocal !== normalizedGst) {
    throw new HttpError(400, "CGST + SGST must match GST rate.");
  }

  if (Number(igstRate.toFixed(2)) !== normalizedGst) {
    throw new HttpError(400, "IGST must match GST rate.");
  }

  return {
    gstRate: normalizedGst,
    cgstRate: Number(cgstRate.toFixed(2)),
    sgstRate: Number(sgstRate.toFixed(2)),
    igstRate: Number(igstRate.toFixed(2))
  };
}

function sortHsnRecords(items) {
  return [...items].sort((a, b) => a.hsnCode.localeCompare(b.hsnCode));
}

async function listHsnRecords(filters) {
  const store = await readCatalogStore();
  let rows = [...store.hsnTaxMaster];

  if (!filters.includeInactive) {
    rows = rows.filter((row) => row.isActive);
  }

  if (filters.q) {
    const query = filters.q.toLowerCase();
    rows = rows.filter(
      (row) =>
        row.hsnCode.toLowerCase().includes(query) ||
        row.description.toLowerCase().includes(query)
    );
  }

  return sortHsnRecords(rows).map(sanitizeHsnRecord);
}

async function getHsnRecord(hsnCode) {
  const store = await readCatalogStore();
  const normalized = normalizeHsnCode(hsnCode);
  const record = store.hsnTaxMaster.find((row) => row.hsnCode === normalized);
  if (!record) {
    throw new HttpError(404, "HSN record not found.");
  }
  return sanitizeHsnRecord(record);
}

async function createHsnRecord(payload, actor) {
  const store = await readCatalogStore();
  const hsnCode = normalizeHsnCode(payload.hsnCode);

  const duplicate = store.hsnTaxMaster.find((row) => row.hsnCode === hsnCode);
  if (duplicate) {
    throw new HttpError(409, "HSN code already exists.");
  }

  const rates = normalizeRates(payload);
  const now = new Date().toISOString();

  const record = {
    hsnCode,
    description: payload.description,
    ...rates,
    effectiveFrom: parseEffectiveDate(payload.effectiveFrom),
    isActive: payload.isActive,
    createdAt: now,
    updatedAt: now
  };

  store.hsnTaxMaster.push(record);
  await writeCatalogStore(store);

  await addActivityLog({
    action: "hsn-tax.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "hsn_tax",
    resourceId: hsnCode
  });

  return sanitizeHsnRecord(record);
}

async function updateHsnRecord(hsnCode, patch, actor) {
  const store = await readCatalogStore();
  const normalized = normalizeHsnCode(hsnCode);

  const index = store.hsnTaxMaster.findIndex((row) => row.hsnCode === normalized);
  if (index < 0) {
    throw new HttpError(404, "HSN record not found.");
  }

  const current = store.hsnTaxMaster[index];

  const rateInputs = {
    gstRate: patch.gstRate === undefined ? current.gstRate : patch.gstRate,
    cgstRate: patch.cgstRate === undefined ? current.cgstRate : patch.cgstRate,
    sgstRate: patch.sgstRate === undefined ? current.sgstRate : patch.sgstRate,
    igstRate: patch.igstRate === undefined ? current.igstRate : patch.igstRate
  };

  const rates = normalizeRates(rateInputs);

  const next = {
    ...current,
    ...patch,
    ...rates,
    effectiveFrom:
      patch.effectiveFrom === undefined
        ? current.effectiveFrom
        : parseEffectiveDate(patch.effectiveFrom),
    updatedAt: new Date().toISOString()
  };

  store.hsnTaxMaster[index] = next;
  await writeCatalogStore(store);

  await addActivityLog({
    action: "hsn-tax.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "hsn_tax",
    resourceId: normalized,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return sanitizeHsnRecord(next);
}

async function archiveHsnRecord(hsnCode, actor) {
  const store = await readCatalogStore();
  const normalized = normalizeHsnCode(hsnCode);
  const index = store.hsnTaxMaster.findIndex((row) => row.hsnCode === normalized);
  if (index < 0) {
    throw new HttpError(404, "HSN record not found.");
  }

  const usedByActiveProduct = store.products.some(
    (product) => product.hsnCode === normalized && product.isActive
  );
  if (usedByActiveProduct) {
    throw new HttpError(
      400,
      "HSN record is used by active products. Reassign products before archive."
    );
  }

  store.hsnTaxMaster[index] = {
    ...store.hsnTaxMaster[index],
    isActive: false,
    updatedAt: new Date().toISOString()
  };

  await writeCatalogStore(store);

  await addActivityLog({
    action: "hsn-tax.archived",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "hsn_tax",
    resourceId: normalized
  });

  return sanitizeHsnRecord(store.hsnTaxMaster[index]);
}

module.exports = {
  listHsnRecords,
  getHsnRecord,
  createHsnRecord,
  updateHsnRecord,
  archiveHsnRecord
};
