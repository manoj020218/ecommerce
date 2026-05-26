import { apiFetch } from "../../shared/api/http-client";

export function fetchHsnTaxRecords(filters = {}) {
  const params = new URLSearchParams();
  params.set("includeInactive", String(Boolean(filters.includeInactive)));
  if (filters.q) {
    params.set("q", filters.q);
  }
  return apiFetch(`/admin/hsn-tax?${params.toString()}`);
}

export function createHsnTaxRecord(payload) {
  return apiFetch("/admin/hsn-tax", {
    method: "POST",
    body: payload
  });
}

export function updateHsnTaxRecord(hsnCode, payload) {
  return apiFetch(`/admin/hsn-tax/${encodeURIComponent(hsnCode)}`, {
    method: "PATCH",
    body: payload
  });
}

export function archiveHsnTaxRecord(hsnCode) {
  return apiFetch(`/admin/hsn-tax/${encodeURIComponent(hsnCode)}`, {
    method: "DELETE"
  });
}
