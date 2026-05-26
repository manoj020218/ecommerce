const { HttpError } = require("../../common/http-error");

const GATEWAY_TYPES = Object.freeze({
  ONLINE: "online",
  MANUAL: "manual"
});

const GATEWAY_MODES = Object.freeze({
  TEST: "test",
  LIVE: "live"
});

const ONLINE_GATEWAY_CODES = Object.freeze(["razorpay", "mock_online"]);
const MANUAL_GATEWAY_CODES = Object.freeze(["manual_upi", "direct_bank_transfer"]);

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeGatewayCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeGateway(gateway) {
  return {
    id: gateway.id,
    code: gateway.code,
    label: gateway.label,
    gatewayType: gateway.gatewayType,
    isEnabled: Boolean(gateway.isEnabled),
    priority: Number(gateway.priority || 100),
    mode: gateway.mode || GATEWAY_MODES.TEST,
    minOrderValue: Number(gateway.minOrderValue || 0),
    maxOrderValue:
      gateway.maxOrderValue === null || gateway.maxOrderValue === undefined
        ? null
        : Number(gateway.maxOrderValue),
    credentialsConfigured: Object.keys(gateway.credentials || {}).length > 0,
    instructions: gateway.instructions || {},
    updatedAt: gateway.updatedAt || null
  };
}

function sanitizeDirectPaymentDiscount(discount) {
  return {
    enabled: Boolean(discount?.enabled),
    percent: roundMoney(discount?.percent || 0),
    applicableMethods: ensureArray(discount?.applicableMethods).map((value) =>
      normalizeGatewayCode(value)
    )
  };
}

function resolveDirectPaymentDiscountPercent(paymentMethod, paymentStore) {
  const normalizedMethod = normalizeGatewayCode(paymentMethod);
  if (!normalizedMethod) {
    return 0;
  }

  const discount = sanitizeDirectPaymentDiscount(paymentStore?.directPaymentDiscount || {});
  if (!discount.enabled) {
    return 0;
  }
  if (!discount.applicableMethods.includes(normalizedMethod)) {
    return 0;
  }
  return Number(discount.percent || 0);
}

function getManualPaymentInstructions(paymentMethod, paymentStore) {
  const normalizedMethod = normalizeGatewayCode(paymentMethod);
  const gateway = ensureArray(paymentStore?.gateways).find(
    (row) => normalizeGatewayCode(row.code) === normalizedMethod
  );
  if (!gateway) {
    return null;
  }

  return {
    gatewayCode: gateway.code,
    gatewayLabel: gateway.label,
    instructions: gateway.instructions || {}
  };
}

function matchesGatewayAmountPolicy(gateway, amount) {
  const minOrderValue = Number(gateway.minOrderValue || 0);
  const maxOrderValue =
    gateway.maxOrderValue === null || gateway.maxOrderValue === undefined
      ? null
      : Number(gateway.maxOrderValue);

  if (amount < minOrderValue) {
    return false;
  }
  if (maxOrderValue !== null && amount > maxOrderValue) {
    return false;
  }
  return true;
}

function selectGatewayForAmount(paymentStore, input) {
  const amount = Number(input.amount || 0);
  const requestedGateway = normalizeGatewayCode(input.requestedGateway || "");
  const gateways = ensureArray(paymentStore?.gateways);

  const onlineEnabled = gateways
    .filter((gateway) => gateway.gatewayType === GATEWAY_TYPES.ONLINE)
    .filter((gateway) => gateway.isEnabled !== false);

  if (requestedGateway) {
    const requested = gateways.find(
      (gateway) => normalizeGatewayCode(gateway.code) === requestedGateway
    );

    if (!requested) {
      throw new HttpError(400, "Requested payment gateway is not configured.");
    }
    if (requested.gatewayType !== GATEWAY_TYPES.ONLINE) {
      throw new HttpError(409, "Requested gateway is not an online payment gateway.");
    }
    if (requested.isEnabled === false) {
      throw new HttpError(409, "Requested payment gateway is currently disabled.");
    }
    if (!matchesGatewayAmountPolicy(requested, amount)) {
      throw new HttpError(
        409,
        "Requested gateway is not available for this order amount."
      );
    }

    return requested;
  }

  const sorted = [...onlineEnabled].sort(
    (a, b) => Number(a.priority || 100) - Number(b.priority || 100)
  );
  const selected = sorted.find((gateway) => matchesGatewayAmountPolicy(gateway, amount));

  if (!selected) {
    throw new HttpError(409, "No enabled online payment gateway is available right now.");
  }

  return selected;
}

module.exports = {
  GATEWAY_TYPES,
  GATEWAY_MODES,
  ONLINE_GATEWAY_CODES,
  MANUAL_GATEWAY_CODES,
  normalizeGatewayCode,
  sanitizeGateway,
  sanitizeDirectPaymentDiscount,
  resolveDirectPaymentDiscountPercent,
  getManualPaymentInstructions,
  selectGatewayForAmount
};
