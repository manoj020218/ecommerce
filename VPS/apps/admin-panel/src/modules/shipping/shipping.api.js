import { apiFetch } from "../../shared/api/http-client";

export function fetchShippingSettings() {
  return apiFetch("/admin/shipping/settings");
}

export function updateShippingSettings(payload) {
  return apiFetch("/admin/shipping/settings", {
    method: "PATCH",
    body: payload
  });
}

export function fetchRateCards(filters = {}) {
  const params = new URLSearchParams();
  if (filters.shippingMethod) {
    params.set("shippingMethod", filters.shippingMethod);
  }
  if (filters.zone) {
    params.set("zone", filters.zone);
  }
  if (filters.includeInactive !== undefined) {
    params.set("includeInactive", String(filters.includeInactive));
  }
  const qs = params.toString();
  return apiFetch(`/admin/shipping/rate-cards${qs ? `?${qs}` : ""}`);
}

export function createRateCard(payload) {
  return apiFetch("/admin/shipping/rate-cards", {
    method: "POST",
    body: payload
  });
}

export function updateRateCard(rateCardId, payload) {
  return apiFetch(`/admin/shipping/rate-cards/${rateCardId}`, {
    method: "PATCH",
    body: payload
  });
}

export function fetchCouriers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.includeInactive !== undefined) {
    params.set("includeInactive", String(filters.includeInactive));
  }
  const qs = params.toString();
  return apiFetch(`/admin/shipping/couriers${qs ? `?${qs}` : ""}`);
}

export function createCourier(payload) {
  return apiFetch("/admin/shipping/couriers", {
    method: "POST",
    body: payload
  });
}

export function updateCourier(id, payload) {
  return apiFetch(`/admin/shipping/couriers/${id}`, {
    method: "PATCH",
    body: payload
  });
}

export function fetchShippingQueue(params = {}) {
  const qs = new URLSearchParams();
  if (params.limit) {
    qs.set("limit", String(params.limit));
  }
  if (params.shipmentStatus) {
    qs.set("shipmentStatus", params.shipmentStatus);
  }
  const qsStr = qs.toString();
  return apiFetch(`/admin/shipping/queue${qsStr ? `?${qsStr}` : ""}`);
}

export function createShipment(payload) {
  return apiFetch("/admin/shipping/shipments", {
    method: "POST",
    body: payload
  });
}

export function fetchShipment(id) {
  return apiFetch(`/admin/shipping/shipments/${id}`);
}

export function updateShipmentTracking(id, payload) {
  return apiFetch(`/admin/shipping/shipments/${id}/tracking`, {
    method: "PATCH",
    body: payload
  });
}

export function updateShipmentStatus(id, payload) {
  return apiFetch(`/admin/shipping/shipments/${id}/status`, {
    method: "PATCH",
    body: payload
  });
}

export function fetchShippingClasses() {
  return apiFetch("/admin/shipping/classes");
}

export function createShippingClass(payload) {
  return apiFetch("/admin/shipping/classes", { method: "POST", body: payload });
}

export function updateShippingClass(id, payload) {
  return apiFetch(`/admin/shipping/classes/${id}`, { method: "PATCH", body: payload });
}
