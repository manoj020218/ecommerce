const CUSTOMER_TYPES = Object.freeze([
  "retail",
  "dealer",
  "stockist",
  "distributor",
  "institutional",
  "project"
]);

const ORDER_MODES = Object.freeze({
  ONLINE: "online",
  OFFLINE_REQUEST: "offline_request",
  HYBRID: "hybrid"
});

const B2B_ORDER_STATUSES = Object.freeze({
  ORDER_REQUEST_RECEIVED: "order_request_received",
  AWAITING_ADMIN_APPROVAL: "awaiting_admin_approval",
  AWAITING_BANK_PAYMENT: "awaiting_bank_payment",
  PAYMENT_RECEIVED: "payment_received",
  PACKING_STARTED: "packing_started",
  READY_FOR_PICKUP: "ready_for_pickup",
  DISPATCHED: "dispatched",
  DELIVERED: "delivered",
  PICKED_UP: "picked_up",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
});

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeCustomerType(value) {
  const normalized = normalizeToken(value);
  if (CUSTOMER_TYPES.includes(normalized)) {
    return normalized;
  }
  return "retail";
}

function normalizePriceGroup(value) {
  return normalizeToken(value);
}

function normalizeOrderMode(value, fallback = ORDER_MODES.ONLINE) {
  const normalized = normalizeToken(value);
  if (Object.values(ORDER_MODES).includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function ensureCustomerB2BFields(user) {
  let changed = false;

  const nextCustomerType = normalizeCustomerType(user.customerType);
  if (user.customerType !== nextCustomerType) {
    user.customerType = nextCustomerType;
    changed = true;
  }

  const nextPriceGroup = normalizePriceGroup(
    user.priceGroup || (nextCustomerType !== "retail" ? nextCustomerType : "")
  );
  if ((user.priceGroup || "") !== nextPriceGroup) {
    user.priceGroup = nextPriceGroup;
    changed = true;
  }

  for (const booleanKey of [
    "isB2BApproved",
    "creditAllowed",
    "bankTransferOnly",
    "pickupAllowed"
  ]) {
    const nextValue = Boolean(user[booleanKey]);
    if (user[booleanKey] !== nextValue) {
      user[booleanKey] = nextValue;
      changed = true;
    }
  }

  const nextOrderMode = normalizeOrderMode(
    user.orderMode,
    user.isB2BApproved ? ORDER_MODES.OFFLINE_REQUEST : ORDER_MODES.ONLINE
  );
  if (user.orderMode !== nextOrderMode) {
    user.orderMode = nextOrderMode;
    changed = true;
  }

  const nextGstin = String(user.gstin || user.gstDetails?.gstin || "").trim().toUpperCase();
  if ((user.gstin || "") !== nextGstin) {
    user.gstin = nextGstin;
    changed = true;
  }

  return changed;
}

function buildCustomerPricingContext(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  ensureCustomerB2BFields(user);

  const customerType = normalizeCustomerType(user.customerType);
  const isB2BApproved = Boolean(user.isB2BApproved && customerType !== "retail");
  const priceGroup = normalizePriceGroup(
    user.priceGroup || (customerType !== "retail" ? customerType : "")
  );

  return {
    customerId: user.id || "",
    customerType,
    priceGroup,
    isB2BApproved,
    companyName: String(user.companyName || "").trim(),
    gstin: String(user.gstin || user.gstDetails?.gstin || "").trim().toUpperCase(),
    creditAllowed: Boolean(user.creditAllowed),
    bankTransferOnly: Boolean(user.bankTransferOnly),
    pickupAllowed: Boolean(user.pickupAllowed),
    orderMode: normalizeOrderMode(
      user.orderMode,
      isB2BApproved ? ORDER_MODES.OFFLINE_REQUEST : ORDER_MODES.ONLINE
    ),
    usesOfflineOrderRequest:
      isB2BApproved &&
      normalizeOrderMode(
        user.orderMode,
        ORDER_MODES.OFFLINE_REQUEST
      ) !== ORDER_MODES.ONLINE
  };
}

function isApprovedB2BCustomer(customerOrContext) {
  if (!customerOrContext || typeof customerOrContext !== "object") {
    return false;
  }

  if ("usesOfflineOrderRequest" in customerOrContext) {
    return Boolean(
      customerOrContext.isB2BApproved &&
        customerOrContext.customerType &&
        customerOrContext.customerType !== "retail"
    );
  }

  const context = buildCustomerPricingContext(customerOrContext);
  return Boolean(context?.isB2BApproved);
}

module.exports = {
  CUSTOMER_TYPES,
  ORDER_MODES,
  B2B_ORDER_STATUSES,
  normalizeCustomerType,
  normalizePriceGroup,
  normalizeOrderMode,
  ensureCustomerB2BFields,
  buildCustomerPricingContext,
  isApprovedB2BCustomer
};
