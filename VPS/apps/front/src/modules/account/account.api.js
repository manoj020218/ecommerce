import { apiFetch } from "../../shared/api/http-client";

function withQuery(path, params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  return query.size ? `${path}?${query.toString()}` : path;
}

export function registerCustomerEmail(payload) {
  return apiFetch("/auth/customer/register-email", {
    method: "POST",
    body: payload
  });
}

export function loginCustomerEmail(payload) {
  return apiFetch("/auth/customer/login-email", {
    method: "POST",
    body: payload
  });
}

export function requestCustomerPasswordReset(payload) {
  return apiFetch("/auth/customer/password/forgot", {
    method: "POST",
    body: payload
  });
}

export function resetCustomerPassword(payload) {
  return apiFetch("/auth/customer/password/reset", {
    method: "POST",
    body: payload
  });
}

export function requestCustomerOtp(payload) {
  return apiFetch("/auth/customer/otp/request", {
    method: "POST",
    body: payload
  });
}

export function verifyCustomerOtp(payload) {
  return apiFetch("/auth/customer/otp/verify", {
    method: "POST",
    body: payload
  });
}

export function logoutCustomer(refreshToken) {
  return apiFetch("/auth/customer/logout", {
    method: "POST",
    body: { refreshToken }
  });
}

export function getCustomerAccountBootstrap(historyLimit = 6) {
  return apiFetch(
    withQuery("/customer/account/bootstrap", { historyLimit }),
    { auth: true }
  );
}

export function updateCustomerProfile(payload) {
  return apiFetch("/customer/account/profile", {
    method: "PATCH",
    auth: true,
    body: payload
  });
}

export function listCustomerOrders(limit = 20) {
  return apiFetch(withQuery("/customer/account/orders", { limit }), {
    auth: true
  });
}

export function getCustomerOrderDetail(orderId) {
  return apiFetch(`/customer/account/orders/${orderId}`, {
    auth: true
  });
}

export function reorderCustomerOrder(orderId, payload) {
  return apiFetch(`/customer/account/orders/${orderId}/reorder`, {
    method: "POST",
    auth: true,
    body: payload
  });
}

export function linkGuestOrder(payload) {
  return apiFetch("/customer/account/orders/link-guest", {
    method: "POST",
    auth: true,
    body: payload
  });
}

export function listCustomerInvoices(limit = 20) {
  return apiFetch(withQuery("/customer/account/invoices", { limit }), {
    auth: true
  });
}

export function getCustomerInvoice(invoiceId) {
  return apiFetch(`/customer/account/invoices/${invoiceId}`, {
    auth: true
  });
}

export function downloadCustomerInvoice(invoiceId) {
  return apiFetch(`/customer/account/invoices/${invoiceId}/download`, {
    auth: true
  });
}

export function listCustomerTracking(limit = 20) {
  return apiFetch(withQuery("/customer/account/tracking", { limit }), {
    auth: true
  });
}

export function listCustomerAddresses() {
  return apiFetch("/customer/account/addresses", {
    auth: true
  });
}

export function createCustomerAddress(payload) {
  return apiFetch("/customer/account/addresses", {
    method: "POST",
    auth: true,
    body: payload
  });
}

export function updateCustomerAddress(addressId, payload) {
  return apiFetch(`/customer/account/addresses/${addressId}`, {
    method: "PATCH",
    auth: true,
    body: payload
  });
}

export function deleteCustomerAddress(addressId) {
  return apiFetch(`/customer/account/addresses/${addressId}`, {
    method: "DELETE",
    auth: true
  });
}

export function updateCustomerGstDetails(payload) {
  return apiFetch("/customer/account/gst-details", {
    method: "PUT",
    auth: true,
    body: payload
  });
}

export function listSavedProducts() {
  return apiFetch("/customer/account/saved-products", {
    auth: true
  });
}

export function saveProduct(productId) {
  return apiFetch(`/customer/account/saved-products/${productId}`, {
    method: "POST",
    auth: true,
    body: {}
  });
}

export function removeSavedProduct(productId) {
  return apiFetch(`/customer/account/saved-products/${productId}`, {
    method: "DELETE",
    auth: true
  });
}

export function submitManualPaymentProof(formData) {
  return apiFetch("/payments/manual/submit", {
    method: "POST",
    auth: true,
    body: formData
  });
}
