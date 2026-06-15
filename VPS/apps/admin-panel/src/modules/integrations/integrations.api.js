import { apiFetch } from "../../shared/api/http-client";

export function fetchIntegrations() {
  return apiFetch("/admin/integrations");
}

export function updateIntegration(code, payload) {
  return apiFetch(`/admin/integrations/${code}`, {
    method: "PATCH",
    body: payload
  });
}

// ── Custom couriers ────────────────────────────────────────────────────────────

export function fetchCouriers() {
  return apiFetch("/admin/integrations/couriers");
}

export function addCourier(payload) {
  return apiFetch("/admin/integrations/couriers", { method: "POST", body: payload });
}

export function updateCourier(id, payload) {
  return apiFetch(`/admin/integrations/couriers/${id}`, { method: "PATCH", body: payload });
}

export function deleteCourier(id) {
  return apiFetch(`/admin/integrations/couriers/${id}`, { method: "DELETE" });
}
