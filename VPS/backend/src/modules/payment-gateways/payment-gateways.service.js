const { HttpError } = require("../../common/http-error");
const {
  cloneDefaultPaymentStore,
  readPaymentStore,
  writePaymentStore
} = require("../../database/payment-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  GATEWAY_TYPES,
  MANUAL_GATEWAY_CODES,
  normalizeGatewayCode,
  sanitizeGateway,
  sanitizeDirectPaymentDiscount,
  selectGatewayForAmount
} = require("./payment-gateways.model");

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeGateways(gateways) {
  const rows = [];
  const byCode = new Map();

  for (const row of ensureArray(gateways)) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const code = normalizeGatewayCode(row.code);
    if (!code) {
      continue;
    }

    const normalized = {
      id: row.id || `pg_${code}`,
      code,
      label: String(row.label || code).trim(),
      gatewayType:
        row.gatewayType === GATEWAY_TYPES.MANUAL
          ? GATEWAY_TYPES.MANUAL
          : GATEWAY_TYPES.ONLINE,
      isEnabled: row.isEnabled !== false,
      priority: Number(row.priority || 100),
      mode: row.mode === "live" ? "live" : "test",
      minOrderValue: Number(row.minOrderValue || 0),
      maxOrderValue:
        row.maxOrderValue === null || row.maxOrderValue === undefined
          ? null
          : Number(row.maxOrderValue),
      credentials:
        row.credentials && typeof row.credentials === "object" && !Array.isArray(row.credentials)
          ? row.credentials
          : {},
      instructions:
        row.instructions && typeof row.instructions === "object" && !Array.isArray(row.instructions)
          ? row.instructions
          : {},
      updatedAt: row.updatedAt || null
    };

    rows.push(normalized);
    byCode.set(code, normalized);
  }

  return { rows, byCode };
}

function ensurePaymentStoreShape(store) {
  const defaults = cloneDefaultPaymentStore();
  let changed = false;

  if (!Array.isArray(store.gateways)) {
    store.gateways = clone(defaults.gateways);
    changed = true;
  } else {
    const normalized = normalizeGateways(store.gateways);
    store.gateways = normalized.rows;
  }

  const existingCodes = new Set(ensureArray(store.gateways).map((row) => row.code));
  for (const defaultGateway of defaults.gateways) {
    if (existingCodes.has(defaultGateway.code)) {
      continue;
    }
    store.gateways.push(clone(defaultGateway));
    changed = true;
  }

  if (
    !store.directPaymentDiscount ||
    typeof store.directPaymentDiscount !== "object" ||
    Array.isArray(store.directPaymentDiscount)
  ) {
    store.directPaymentDiscount = clone(defaults.directPaymentDiscount);
    changed = true;
  }

  if (!Array.isArray(store.directPaymentDiscount.applicableMethods)) {
    store.directPaymentDiscount.applicableMethods = clone(
      defaults.directPaymentDiscount.applicableMethods
    );
    changed = true;
  }

  if (!Array.isArray(store.manualPaymentSubmissions)) {
    store.manualPaymentSubmissions = [];
    changed = true;
  }

  if (!Array.isArray(store.processedWebhooks)) {
    store.processedWebhooks = [];
    changed = true;
  }

  return changed;
}

function findGatewayOrThrow(paymentStore, gatewayCode) {
  const code = normalizeGatewayCode(gatewayCode);
  const row = ensureArray(paymentStore.gateways).find((gateway) => gateway.code === code);
  if (!row) {
    throw new HttpError(404, "Payment gateway not found.");
  }
  return row;
}

function sortByPriority(gateways) {
  return [...gateways].sort(
    (a, b) => Number(a.priority || 100) - Number(b.priority || 100)
  );
}

async function listPaymentGateways(filters = {}) {
  const paymentStore = await readPaymentStore();
  const changed = ensurePaymentStoreShape(paymentStore);
  if (changed) {
    await writePaymentStore(paymentStore);
  }

  let gateways = ensureArray(paymentStore.gateways);
  if (filters.gatewayType) {
    gateways = gateways.filter((gateway) => gateway.gatewayType === filters.gatewayType);
  }
  if (!filters.includeDisabled) {
    gateways = gateways.filter((gateway) => gateway.isEnabled !== false);
  }

  return {
    gateways: sortByPriority(gateways).map(sanitizeGateway),
    directPaymentDiscount: sanitizeDirectPaymentDiscount(paymentStore.directPaymentDiscount)
  };
}

async function getPaymentGatewayConfig(gatewayCode) {
  const paymentStore = await readPaymentStore();
  const changed = ensurePaymentStoreShape(paymentStore);
  if (changed) {
    await writePaymentStore(paymentStore);
  }

  const gateway = findGatewayOrThrow(paymentStore, gatewayCode);
  return {
    ...sanitizeGateway(gateway),
    credentials: clone(gateway.credentials || {}),
    instructions: clone(gateway.instructions || {})
  };
}

async function updatePaymentGateway(gatewayCode, patch, actor) {
  const paymentStore = await readPaymentStore();
  ensurePaymentStoreShape(paymentStore);

  const gateway = findGatewayOrThrow(paymentStore, gatewayCode);
  if (patch.minOrderValue !== undefined && patch.maxOrderValue !== undefined) {
    if (
      patch.maxOrderValue !== null &&
      Number(patch.maxOrderValue) < Number(patch.minOrderValue)
    ) {
      throw new HttpError(400, "maxOrderValue cannot be less than minOrderValue.");
    }
  }

  if (patch.maxOrderValue !== undefined) {
    const nextMax = patch.maxOrderValue;
    const minOrderValue =
      patch.minOrderValue === undefined ? Number(gateway.minOrderValue || 0) : Number(patch.minOrderValue);
    if (nextMax !== null && Number(nextMax) < minOrderValue) {
      throw new HttpError(400, "maxOrderValue cannot be less than minOrderValue.");
    }
  }

  if (patch.priority !== undefined) {
    gateway.priority = Number(patch.priority);
  }
  if (patch.label !== undefined) {
    gateway.label = patch.label;
  }
  if (patch.isEnabled !== undefined) {
    gateway.isEnabled = Boolean(patch.isEnabled);
  }
  if (patch.mode !== undefined) {
    gateway.mode = patch.mode;
  }
  if (patch.minOrderValue !== undefined) {
    gateway.minOrderValue = Number(patch.minOrderValue);
  }
  if (patch.maxOrderValue !== undefined) {
    gateway.maxOrderValue =
      patch.maxOrderValue === null ? null : Number(patch.maxOrderValue);
  }
  if (patch.credentials !== undefined) {
    gateway.credentials =
      patch.credentials && typeof patch.credentials === "object" && !Array.isArray(patch.credentials)
        ? patch.credentials
        : {};
  }
  if (patch.instructions !== undefined) {
    gateway.instructions =
      patch.instructions &&
      typeof patch.instructions === "object" &&
      !Array.isArray(patch.instructions)
        ? patch.instructions
        : {};
  }
  gateway.updatedAt = nowIso();

  await writePaymentStore(paymentStore);

  await addActivityLog({
    action: "payment_gateway.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "payment_gateway",
    resourceId: gateway.code,
    metadata: {
      changedFields: Object.keys(patch || {})
    }
  });

  return sanitizeGateway(gateway);
}

async function updateDirectPaymentDiscountConfig(patch, actor) {
  const paymentStore = await readPaymentStore();
  ensurePaymentStoreShape(paymentStore);

  const current = paymentStore.directPaymentDiscount;
  if (patch.enabled !== undefined) {
    current.enabled = Boolean(patch.enabled);
  }
  if (patch.percent !== undefined) {
    current.percent = Number(patch.percent);
  }
  if (patch.applicableMethods !== undefined) {
    const allowed = new Set([...MANUAL_GATEWAY_CODES]);
    current.applicableMethods = ensureArray(patch.applicableMethods)
      .map((value) => normalizeGatewayCode(value))
      .filter((value) => allowed.has(value));
  }

  await writePaymentStore(paymentStore);

  await addActivityLog({
    action: "payment_gateway.direct_discount.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "payment_discount",
    resourceId: "direct_payment_discount",
    metadata: {
      changedFields: Object.keys(patch || {})
    }
  });

  return sanitizeDirectPaymentDiscount(current);
}

function resolveGatewayForPaymentAttempt(paymentStore, input) {
  return selectGatewayForAmount(paymentStore, input);
}

module.exports = {
  MANUAL_GATEWAY_CODES,
  ensurePaymentStoreShape,
  listPaymentGateways,
  getPaymentGatewayConfig,
  updatePaymentGateway,
  updateDirectPaymentDiscountConfig,
  resolveGatewayForPaymentAttempt
};
