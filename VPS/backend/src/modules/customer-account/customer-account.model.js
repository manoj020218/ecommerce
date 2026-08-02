const { sanitizeCustomerUser } = require("../auth/auth.model");
const {
  ensureCustomerB2BFields,
  buildCustomerPricingContext
} = require("../customers/customers.model");

const REORDER_MODES = Object.freeze({
  REPLACE: "replace",
  MERGE: "merge"
});

const DEFAULT_GST_DETAILS = Object.freeze({
  gstin: "",
  businessName: "",
  contactName: ""
});

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function createAddressSnapshot(address = {}) {
  return {
    id: address.id || null,
    label: address.label || "",
    name: address.name || "",
    mobile: address.mobile || "",
    email: address.email || "",
    addressLine1: address.addressLine1 || "",
    addressLine2: address.addressLine2 || "",
    city: address.city || "",
    state: address.state || "",
    stateCode: address.stateCode || "",
    pincode: address.pincode || "",
    country: address.country || "India",
    isDefaultBilling: Boolean(address.isDefaultBilling),
    isDefaultShipping: Boolean(address.isDefaultShipping)
  };
}

// Short business-facing reference code (e.g. "F056E"), derived from the
// customer's own id so it's unique for free — no collision bookkeeping
// needed since it inherits uniqueness from the id it's built from.
function generateCustomerCode(userId) {
  const cleaned = String(userId || "").replace(/[^a-zA-Z0-9]/g, "");
  const tail = cleaned.slice(-5).toUpperCase();
  return tail || "00000";
}

const ACCOUNT_STATUSES = Object.freeze({
  ACTIVE: "active",
  BLOCKED: "blocked"
});

function ensureCustomerAccountShape(user) {
  let changed = false;

  if (typeof user.companyName !== "string") {
    user.companyName = "";
    changed = true;
  }

  if (!user.customerCode) {
    user.customerCode = generateCustomerCode(user.id);
    changed = true;
  }

  if (typeof user.newsletterSubscribed !== "boolean") {
    user.newsletterSubscribed = false;
    changed = true;
  }

  if (!Object.values(ACCOUNT_STATUSES).includes(user.accountStatus)) {
    user.accountStatus = ACCOUNT_STATUSES.ACTIVE;
    changed = true;
  }

  if (!Array.isArray(user.savedAddresses)) {
    user.savedAddresses = [];
    changed = true;
  }

  if (!Array.isArray(user.savedProductIds)) {
    user.savedProductIds = [];
    changed = true;
  }

  if (!user.gstDetails || typeof user.gstDetails !== "object" || Array.isArray(user.gstDetails)) {
    user.gstDetails = { ...DEFAULT_GST_DETAILS };
    changed = true;
  }

  if (ensureCustomerB2BFields(user)) {
    changed = true;
  }

  const nextGstin = String(user.gstin || user.gstDetails?.gstin || "").trim().toUpperCase();
  if ((user.gstDetails.gstin || "") !== nextGstin) {
    user.gstDetails.gstin = nextGstin;
    changed = true;
  }

  return changed;
}

function sanitizeCustomerAddress(address) {
  return createAddressSnapshot(address);
}

function sanitizeGstDetails(gstDetails) {
  return {
    gstin: gstDetails?.gstin || "",
    businessName: gstDetails?.businessName || "",
    contactName: gstDetails?.contactName || ""
  };
}

function sanitizeCustomerAccountProfile(user) {
  const safeUser = sanitizeCustomerUser(user);
  const customerPricingContext = buildCustomerPricingContext(safeUser) || {};

  return {
    id: safeUser.id,
    customerCode: safeUser.customerCode || "",
    name: safeUser.name || "",
    companyName: safeUser.companyName || "",
    email: safeUser.email || "",
    mobile: safeUser.mobile || "",
    newsletterSubscribed: Boolean(safeUser.newsletterSubscribed),
    accountStatus: safeUser.accountStatus || "active",
    verifiedEmail: Boolean(safeUser.verifiedEmail),
    verifiedMobile: Boolean(safeUser.verifiedMobile),
    authProviders: ensureArray(safeUser.authProviders),
    customerType: customerPricingContext.customerType || "retail",
    priceGroup: customerPricingContext.priceGroup || "",
    isB2BApproved: Boolean(customerPricingContext.isB2BApproved),
    gstin: customerPricingContext.gstin || "",
    creditAllowed: Boolean(customerPricingContext.creditAllowed),
    bankTransferOnly: Boolean(customerPricingContext.bankTransferOnly),
    pickupAllowed: Boolean(customerPricingContext.pickupAllowed),
    orderMode: customerPricingContext.orderMode || "online",
    savedAddresses: ensureArray(safeUser.savedAddresses).map(sanitizeCustomerAddress),
    gstDetails: sanitizeGstDetails(safeUser.gstDetails),
    savedProductsCount: ensureArray(safeUser.savedProductIds).length,
    createdAt: safeUser.createdAt || null,
    lastLoginAt: safeUser.lastLoginAt || null
  };
}

module.exports = {
  REORDER_MODES,
  DEFAULT_GST_DETAILS,
  ACCOUNT_STATUSES,
  ensureArray,
  ensureCustomerAccountShape,
  sanitizeCustomerAddress,
  sanitizeGstDetails,
  sanitizeCustomerAccountProfile
};
