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

export function fetchCustomers(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/customers${suffix}`);
}

export function createCustomer(payload) {
  return apiFetch("/admin/customers", {
    method: "POST",
    body: payload
  });
}

export function fetchCustomerOrders(customerId) {
  return apiFetch(`/admin/customers/${customerId}/orders`);
}

export function updateCustomer(customerId, payload) {
  return apiFetch(`/admin/customers/${customerId}`, {
    method: "PATCH",
    body: payload
  });
}

export function fetchB2BOrderRequests(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/customers/order-requests/list${suffix}`);
}

export function approveB2BOrderRequest(orderId, payload = {}) {
  return apiFetch(`/admin/customers/order-requests/${orderId}/approve`, {
    method: "POST",
    body: payload
  });
}

export function updateB2BOrderStatus(orderId, payload) {
  return apiFetch(`/admin/customers/order-requests/${orderId}/status`, {
    method: "PATCH",
    body: payload
  });
}

export function fetchManualPayments(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/manual-payments${suffix}`);
}

export function verifyManualPayment(submissionId, payload) {
  return apiFetch(`/admin/manual-payments/${submissionId}/verify`, {
    method: "POST",
    body: payload
  });
}
