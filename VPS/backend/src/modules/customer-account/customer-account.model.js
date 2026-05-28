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

function ensureCustomerAccountShape(user) {
  let changed = false;

  if (typeof user.companyName !== "string") {
    user.companyName = "";
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
    name: safeUser.name || "",
    companyName: safeUser.companyName || "",
    email: safeUser.email || "",
    mobile: safeUser.mobile || "",
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
  ensureArray,
  ensureCustomerAccountShape,
  sanitizeCustomerAddress,
  sanitizeGstDetails,
  sanitizeCustomerAccountProfile
};
