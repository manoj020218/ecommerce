import { apiFetch } from "../../shared/api/http-client";

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  return query.toString();
}

export function fetchOrders(params = {}) {
  const query = buildQuery(params);
  return apiFetch(`/admin/orders${query ? `?${query}` : ""}`);
}

export function fetchOrderDetail(orderId) {
  return apiFetch(`/admin/orders/${orderId}`);
}

export function updateOrder(orderId, patch) {
  return apiFetch(`/admin/orders/${orderId}`, { method: "PATCH", body: patch });
}

export function editOrderItems(orderId, payload) {
  return apiFetch(`/admin/orders/${orderId}/items`, { method: "PATCH", body: payload });
}

export function exportOrdersUrl(params = {}) {
  const query = buildQuery(params);
  return `/api/admin/orders/export${query ? `?${query}` : ""}`;
}

export function fetchStuckPaymentSessions() {
  return apiFetch("/admin/orders/stuck-payments");
}

// Invoices
export function generateInvoiceForOrder(orderId, payload = {}) {
  return apiFetch(`/admin/invoices/order/${orderId}/generate`, { method: "POST", body: payload });
}

export function fetchInvoiceForOrder(orderId) {
  return apiFetch(`/admin/invoices/order/${orderId}`);
}

export function fetchInvoiceDownloadData(invoiceId) {
  return apiFetch(`/admin/invoices/${invoiceId}/download`);
}

export function correctInvoiceBuyer(invoiceId, payload) {
  return apiFetch(`/admin/invoices/${invoiceId}/buyer-details`, { method: "PATCH", body: payload });
}

// Shipping / Couriers
export function fetchShippingCouriers() {
  return apiFetch("/admin/shipping/couriers");
}

export function createShippingCourier(payload) {
  return apiFetch("/admin/shipping/couriers", { method: "POST", body: payload });
}

export function createShipment(payload) {
  return apiFetch("/admin/shipping/shipments", { method: "POST", body: payload });
}

export function updateShipmentTracking(shipmentId, payload) {
  return apiFetch(`/admin/shipping/shipments/${shipmentId}/tracking`, { method: "PATCH", body: payload });
}

export function updateShipmentStatus(shipmentId, payload) {
  return apiFetch(`/admin/shipping/shipments/${shipmentId}/status`, { method: "PATCH", body: payload });
}

// Manual payment proof review (scoped to a single order)
export function fetchManualPaymentsForOrder(orderId) {
  return apiFetch(`/admin/manual-payments?orderId=${encodeURIComponent(orderId)}`);
}

export function verifyManualPayment(submissionId, payload) {
  return apiFetch(`/admin/manual-payments/${submissionId}/verify`, { method: "POST", body: payload });
}

export function demandManualPayment(orderId) {
  return apiFetch(`/admin/manual-payments/orders/${orderId}/demand`, { method: "POST", body: {} });
}

export function sendTrackingEmail(shipmentId, payload) {
  return apiFetch(`/admin/shipping/shipments/${shipmentId}/tracking-email`, { method: "POST", body: payload });
}

export function uploadShipmentPod(shipmentId, file) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/admin/shipping/shipments/${shipmentId}/pod`, { method: "POST", body: form });
}
