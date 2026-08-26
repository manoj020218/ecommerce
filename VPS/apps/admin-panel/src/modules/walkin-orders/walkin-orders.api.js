import { apiFetch } from "../../shared/api/http-client";

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    query.set(key, String(value));
  });

  return query.toString();
}

export function fetchWalkInOrders(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/walkin-orders${suffix}`);
}

export function searchWalkInCustomers(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/walkin-orders/customers${suffix}`);
}

export function searchWalkInProducts(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/walkin-orders/products${suffix}`);
}

export function fetchWalkInCategories() {
  return apiFetch("/admin/walkin-orders/categories");
}

export function createWalkInOrder(payload) {
  return apiFetch("/admin/walkin-orders", {
    method: "POST",
    body: payload
  });
}

export function updateWalkInOrder(orderId, payload) {
  return apiFetch(`/admin/walkin-orders/${orderId}`, {
    method: "PATCH",
    body: payload
  });
}

export function confirmWalkInPayment(orderId, payload) {
  return apiFetch(`/admin/walkin-orders/${orderId}/confirm-payment`, {
    method: "POST",
    body: payload
  });
}

export function generateWalkInInvoice(orderId, payload = {}) {
  return apiFetch(`/admin/walkin-orders/${orderId}/generate-invoice`, {
    method: "POST",
    body: payload
  });
}

export function updateWalkInOrderStatus(orderId, payload) {
  return apiFetch(`/admin/walkin-orders/${orderId}/status`, {
    method: "PATCH",
    body: payload
  });
}

export function saveWalkInCustomer(payload) {
  return apiFetch("/admin/walkin-orders/customers", {
    method: "POST",
    body: payload
  });
}

export function sendWalkInPaymentRequest(orderId) {
  return apiFetch(`/admin/walkin-orders/${orderId}/send-payment-request`, {
    method: "POST",
    body: {}
  });
}

export function previewWalkInInvoice(orderId) {
  return apiFetch(`/admin/walkin-orders/${orderId}/invoice-preview`);
}
