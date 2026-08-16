const crypto = require("node:crypto");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const { readCatalogStore } = require("../../database/catalog-store");
const { readPartnerStore, writePartnerStore } = require("../../database/partner-store");
const { getAllSettings } = require("../settings/settings.service");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { normalizeBaseUrl } = require("../seo/seo.model");
const { buildProductFeedFields } = require("../google-merchant/google-merchant.model");
const {
  COMMISSION_STATUSES,
  sanitizePartner,
  toPublicPartner,
  sanitizeCommissionLedgerEntry
} = require("./partners.model");

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function generateApiKey() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 24);
}

function autoGenerateCode(store, name) {
  const base = normalizeCode(name).slice(0, 12) || "PARTNER";
  let candidate = base;
  let suffix = 1;
  const existingCodes = new Set(ensureArray(store.partners).map((row) => row.code));
  while (existingCodes.has(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

function ensureUniquePartnerCode(store, code, ignorePartnerId = null) {
  const duplicate = ensureArray(store.partners).find(
    (row) => row.id !== ignorePartnerId && row.code === code
  );
  if (duplicate) {
    throw new HttpError(409, "A partner with this code already exists.");
  }
}

function findPartner(store, partnerId) {
  return ensureArray(store.partners).find((row) => row.id === partnerId);
}

async function createPartner(payload, actor) {
  const store = await readPartnerStore();

  const code = payload.code ? normalizeCode(payload.code) : autoGenerateCode(store, payload.name);
  if (!code) {
    throw new HttpError(400, "Could not derive a partner code from the given name.");
  }
  ensureUniquePartnerCode(store, code);

  const partner = {
    id: generateId("partner"),
    code,
    name: payload.name,
    isActive: true,
    commissionRatePercent: payload.commissionRatePercent,
    attributionWindowDays: payload.attributionWindowDays,
    returnUrl: payload.returnUrl || "",
    apiKey: generateApiKey(),
    productIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  store.partners.push(partner);
  await writePartnerStore(store);

  await addActivityLog({
    action: "partners.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "partner",
    resourceId: partner.id,
    metadata: { code: partner.code }
  });

  return sanitizePartner(partner);
}

async function updatePartner(partnerId, payload, actor) {
  const store = await readPartnerStore();
  const partner = findPartner(store, partnerId);
  if (!partner) {
    throw new HttpError(404, "Partner not found.");
  }

  if (payload.code) {
    const nextCode = normalizeCode(payload.code);
    if (nextCode !== partner.code) {
      ensureUniquePartnerCode(store, nextCode, partnerId);
      partner.code = nextCode;
    }
  }

  if (payload.name !== undefined) partner.name = payload.name;
  if (payload.commissionRatePercent !== undefined) {
    partner.commissionRatePercent = payload.commissionRatePercent;
  }
  if (payload.attributionWindowDays !== undefined) {
    partner.attributionWindowDays = payload.attributionWindowDays;
  }
  if (payload.returnUrl !== undefined) partner.returnUrl = payload.returnUrl;
  if (payload.isActive !== undefined) partner.isActive = Boolean(payload.isActive);
  partner.updatedAt = nowIso();

  await writePartnerStore(store);

  await addActivityLog({
    action: "partners.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "partner",
    resourceId: partner.id
  });

  return sanitizePartner(partner);
}

async function listPartners() {
  const store = await readPartnerStore();
  return ensureArray(store.partners)
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .map(sanitizePartner);
}

async function getPartner(partnerId) {
  const store = await readPartnerStore();
  const partner = findPartner(store, partnerId);
  if (!partner) {
    throw new HttpError(404, "Partner not found.");
  }
  return sanitizePartner(partner);
}

async function deletePartner(partnerId, actor) {
  const store = await readPartnerStore();
  const index = ensureArray(store.partners).findIndex((row) => row.id === partnerId);
  if (index < 0) {
    throw new HttpError(404, "Partner not found.");
  }
  store.partners.splice(index, 1);
  await writePartnerStore(store);

  await addActivityLog({
    action: "partners.deleted",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "partner",
    resourceId: partnerId
  });

  return { id: partnerId, deleted: true };
}

async function regeneratePartnerApiKey(partnerId, actor) {
  const store = await readPartnerStore();
  const partner = findPartner(store, partnerId);
  if (!partner) {
    throw new HttpError(404, "Partner not found.");
  }
  partner.apiKey = generateApiKey();
  partner.updatedAt = nowIso();
  await writePartnerStore(store);

  await addActivityLog({
    action: "partners.api_key_regenerated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "partner",
    resourceId: partner.id
  });

  return sanitizePartner(partner);
}

async function assignProductsToPartner(partnerId, productIds, actor) {
  const store = await readPartnerStore();
  const partner = findPartner(store, partnerId);
  if (!partner) {
    throw new HttpError(404, "Partner not found.");
  }
  partner.productIds = [...new Set(ensureArray(productIds))];
  partner.updatedAt = nowIso();
  await writePartnerStore(store);

  await addActivityLog({
    action: "partners.products_assigned",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "partner",
    resourceId: partner.id,
    metadata: { productCount: partner.productIds.length }
  });

  return sanitizePartner(partner);
}

async function resolvePartnerByCode(code) {
  const store = await readPartnerStore();
  const normalized = normalizeCode(code);
  const partner = ensureArray(store.partners).find(
    (row) => row.code === normalized && row.isActive !== false
  );
  if (!partner) {
    throw new HttpError(404, "Partner not found.");
  }
  return toPublicPartner(partner);
}

async function buildPartnerFeed(code, apiKey) {
  const store = await readPartnerStore();
  const normalized = normalizeCode(code);
  const partner = ensureArray(store.partners).find((row) => row.code === normalized);
  if (!partner || partner.isActive === false) {
    throw new HttpError(404, "Partner not found.");
  }
  if (!apiKey || apiKey !== partner.apiKey) {
    throw new HttpError(401, "Invalid or missing feed API key.");
  }

  const [catalogStore, settings] = await Promise.all([readCatalogStore(), getAllSettings()]);
  const baseUrl = normalizeBaseUrl(settings.seoDefaults.canonicalDomain, env.publicBaseUrl);
  const categoriesById = new Map(
    ensureArray(catalogStore.categories).map((category) => [category.id, category])
  );
  const assignedIds = new Set(partner.productIds);

  const products = ensureArray(catalogStore.products)
    .filter((product) => product.isActive && assignedIds.has(product.id))
    .map((product) => {
      const fields = buildProductFeedFields(product, {
        baseUrl,
        apiBaseUrl: env.publicBaseUrl,
        categoriesById,
        storeName: settings.storeProfile.storeName || "Jenix India",
        defaultOgImageUrl: settings.seoDefaults.defaultOgImageUrl || ""
      });

      return {
        id: product.id,
        slug: product.slug,
        title: fields.title,
        description: fields.description,
        price: fields.salePrice || fields.price,
        currency: "INR",
        image: fields.imageLink,
        availability: fields.availability,
        buyNowUrl: `${fields.link}?ref=${partner.code}`
      };
    });

  return {
    partner: { code: partner.code, name: partner.name },
    productCount: products.length,
    products
  };
}

// Called from checkout. Never throws -- a stale/bad/expired ref param must
// never block a real sale, it should just silently mean "no attribution."
async function resolveAttribution(sourcePartnerCode, sourcePartnerCapturedAt) {
  if (!sourcePartnerCode || !sourcePartnerCapturedAt) {
    return null;
  }

  try {
    const store = await readPartnerStore();
    const normalized = normalizeCode(sourcePartnerCode);
    const partner = ensureArray(store.partners).find(
      (row) => row.code === normalized && row.isActive !== false
    );
    if (!partner) {
      return null;
    }

    const capturedAtMs = Date.parse(sourcePartnerCapturedAt);
    if (Number.isNaN(capturedAtMs)) {
      return null;
    }
    const windowMs = Number(partner.attributionWindowDays || 0) * 24 * 60 * 60 * 1000;
    if (Date.now() - capturedAtMs > windowMs) {
      return null;
    }

    return { partnerId: partner.id, partnerCode: partner.code };
  } catch (_error) {
    return null;
  }
}

// Idempotent: safe to call from every code path that flips an order to
// paid, no matter which one actually fires for a given order.
async function creditPartnerCommissionForOrder(order) {
  if (!order || !order.sourcePartnerCode) {
    return null;
  }

  const store = await readPartnerStore();
  const alreadyCredited = ensureArray(store.commissionLedger).some(
    (row) => row.orderId === order.id
  );
  if (alreadyCredited) {
    return null;
  }

  const partner = ensureArray(store.partners).find((row) => row.id === order.sourcePartnerId);
  if (!partner) {
    return null;
  }

  const commissionBase = Math.max(
    0,
    Number(order.productSubtotal || 0) - Number(order.discountAmount || 0)
  );
  const commissionRatePercent = Number(partner.commissionRatePercent || 0);
  const commissionAmount = Math.round((commissionBase * commissionRatePercent) / 100 * 100) / 100;

  const entry = {
    id: generateId("commission"),
    partnerId: partner.id,
    partnerCode: partner.code,
    orderId: order.id,
    orderNo: order.orderNo || "",
    orderGrandTotal: Number(order.grandTotal || 0),
    commissionBase,
    commissionRatePercent,
    commissionAmount,
    status: COMMISSION_STATUSES.PENDING,
    paidAt: null,
    paidNote: "",
    createdAt: nowIso()
  };

  store.commissionLedger.push(entry);
  await writePartnerStore(store);

  await addActivityLog({
    action: "partners.commission_credited",
    actorId: "system",
    actorRole: "system",
    resourceType: "commission",
    resourceId: entry.id,
    metadata: { partnerCode: partner.code, orderId: order.id, commissionAmount }
  });

  return sanitizeCommissionLedgerEntry(entry);
}

async function listCommissionLedger(partnerId, filters = {}) {
  const store = await readPartnerStore();
  let rows = ensureArray(store.commissionLedger).filter((row) => row.partnerId === partnerId);

  if (filters.status) {
    rows = rows.filter((row) => row.status === filters.status);
  }

  rows = rows.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
  return rows.map(sanitizeCommissionLedgerEntry);
}

async function markCommissionPaid(ledgerId, payload, actor) {
  const store = await readPartnerStore();
  const entry = ensureArray(store.commissionLedger).find((row) => row.id === ledgerId);
  if (!entry) {
    throw new HttpError(404, "Commission entry not found.");
  }

  entry.status = COMMISSION_STATUSES.PAID;
  entry.paidAt = nowIso();
  entry.paidNote = payload.note || "";

  await writePartnerStore(store);

  await addActivityLog({
    action: "partners.commission_marked_paid",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "commission",
    resourceId: entry.id
  });

  return sanitizeCommissionLedgerEntry(entry);
}

module.exports = {
  createPartner,
  updatePartner,
  listPartners,
  getPartner,
  deletePartner,
  regeneratePartnerApiKey,
  assignProductsToPartner,
  resolvePartnerByCode,
  buildPartnerFeed,
  resolveAttribution,
  creditPartnerCommissionForOrder,
  listCommissionLedger,
  markCommissionPaid
};
