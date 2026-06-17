import {
  getOrCreateGuestSessionId,
  getStoredGuestSessionId
} from "../../shared/cart/guest-session";

export const PAYMENT_METHOD_OPTIONS = [
  { value: "online", label: "Online Payment" },
  { value: "direct_bank_transfer", label: "Direct Bank Transfer" },
  { value: "manual_upi", label: "Manual UPI" }
];

export const SHIPPING_METHOD_OPTIONS = [
  { value: "standard", label: "Standard Shipping" },
  { value: "express", label: "Express Shipping" },
  { value: "local_pickup", label: "Local Pickup" },
  { value: "self_pickup", label: "Self Pickup" },
  { value: "transport", label: "Transport" },
  { value: "manual_delivery", label: "Manual Delivery" }
];

export const STOREFRONT_CART_UPDATED_EVENT = "storefront-cart-updated";

export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

export function humanizeStatus(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/_/g, " ");

  if (!normalized) {
    return "--";
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function createAddressForm(seed = {}) {
  return {
    companyName: seed.companyName || "",
    gstin: seed.gstin || "",
    name: seed.name || "",
    email: seed.email || "",
    mobile: seed.mobile || "",
    addressLine1: seed.addressLine1 || "",
    addressLine2: seed.addressLine2 || "",
    city: seed.city || "",
    state: seed.state || "",
    stateCode: seed.stateCode || "",
    pincode: seed.pincode || "",
    country: seed.country || "India"
  };
}

export function buildAddressPayload(form = {}) {
  return {
    companyName: form.companyName || "",
    gstin: form.gstin || "",
    name: form.name || "",
    email: form.email || "",
    mobile: form.mobile || "",
    addressLine1: form.addressLine1 || "",
    addressLine2: form.addressLine2 || "",
    city: form.city || "",
    state: form.state || "",
    stateCode: form.stateCode || "",
    pincode: form.pincode || "",
    country: form.country || "India"
  };
}

export function buildCartContext(isAuthenticated) {
  return isAuthenticated ? {} : { sessionId: getOrCreateGuestSessionId() };
}

export function getExistingGuestSessionId() {
  return getStoredGuestSessionId();
}

export function notifyStorefrontCartUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STOREFRONT_CART_UPDATED_EVENT));
  }
}
