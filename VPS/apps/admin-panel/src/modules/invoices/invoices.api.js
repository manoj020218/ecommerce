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

export function fetchInvoices(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/invoices${suffix}`);
}

export function fetchInvoice(invoiceId) {
  return apiFetch(`/admin/invoices/${invoiceId}`);
}

export function fetchInvoiceForOrder(orderId) {
  return apiFetch(`/admin/invoices/order/${orderId}`);
}

export function generateInvoice(orderId, payload = {}) {
  return apiFetch(`/admin/invoices/order/${orderId}/generate`, {
    method: "POST",
    body: payload
  });
}

export function fetchInvoiceDownload(invoiceId) {
  return apiFetch(`/admin/invoices/${invoiceId}/download`);
}
