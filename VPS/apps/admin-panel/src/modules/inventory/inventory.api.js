import { apiFetch } from "../../shared/api/http-client";

export function fetchInventoryByProduct(productId) {
  return apiFetch(`/admin/inventory/products/${productId}`);
}

export function adjustInventory(productId, payload) {
  return apiFetch(`/admin/inventory/products/${productId}/adjust`, {
    method: "POST",
    body: payload
  });
}

export function updateInventoryPolicy(productId, payload) {
  return apiFetch(`/admin/inventory/products/${productId}/policy`, {
    method: "PATCH",
    body: payload
  });
}

export function fetchInventoryMovements(filters = {}) {
  const params = new URLSearchParams();
  if (filters.productId) {
    params.set("productId", filters.productId);
  }
  params.set("limit", String(filters.limit || 100));
  return apiFetch(`/admin/inventory/movements?${params.toString()}`);
}

export function fetchLowStockAlerts(limit = 100) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  return apiFetch(`/admin/inventory/low-stock?${params.toString()}`);
}
