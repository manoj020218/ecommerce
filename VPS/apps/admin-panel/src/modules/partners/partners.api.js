import { apiFetch } from "../../shared/api/http-client";

export function fetchPartners() {
  return apiFetch("/admin/partners");
}

export function fetchPartner(partnerId) {
  return apiFetch(`/admin/partners/${partnerId}`);
}

export function createPartner(payload) {
  return apiFetch("/admin/partners", { method: "POST", body: payload });
}

export function updatePartner(partnerId, payload) {
  return apiFetch(`/admin/partners/${partnerId}`, { method: "PATCH", body: payload });
}

export function deletePartner(partnerId) {
  return apiFetch(`/admin/partners/${partnerId}`, { method: "DELETE" });
}

export function regeneratePartnerApiKey(partnerId) {
  return apiFetch(`/admin/partners/${partnerId}/regenerate-key`, { method: "POST" });
}

export function assignPartnerProducts(partnerId, productIds) {
  return apiFetch(`/admin/partners/${partnerId}/products`, {
    method: "POST",
    body: { productIds }
  });
}

export function fetchPartnerCommissions(partnerId, params = {}) {
  const query = new URLSearchParams();
  if (params.status) {
    query.set("status", params.status);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch(`/admin/partners/${partnerId}/commissions${suffix}`);
}

export function markCommissionPaid(ledgerId, note) {
  return apiFetch(`/admin/partners/commissions/${ledgerId}/mark-paid`, {
    method: "PATCH",
    body: { note }
  });
}
