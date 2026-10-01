import { apiFetch } from "../../shared/api/http-client";

// Dealers admin API (2026-10-01)
export function fetchDealers(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) query.set(k, String(v)); });
  const suffix = query.toString() ? `?${query}` : "";
  return apiFetch(`/admin/dealers${suffix}`);
}

export function fetchDealer(customerId) {
  return apiFetch(`/admin/dealers/${customerId}`);
}

export function updateDealer(customerId, payload) {
  return apiFetch(`/admin/dealers/${customerId}`, { method: "PATCH", body: payload });
}
