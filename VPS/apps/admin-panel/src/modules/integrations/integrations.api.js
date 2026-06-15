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

// Test a tracking API without saving the courier first
export function probeTracking(payload) {
  return apiFetch("/admin/integrations/couriers/probe-tracking", { method: "POST", body: payload });
}

// Fetch live tracking for a saved courier
export function fetchCourierTracking(courierId, trackingId) {
  return apiFetch(`/admin/integrations/couriers/${courierId}/track?trackingId=${encodeURIComponent(trackingId)}`);
}
