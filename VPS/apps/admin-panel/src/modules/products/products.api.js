import { apiFetch } from "../../shared/api/http-client";

export function fetchProducts(filters = {}) {
  const params = new URLSearchParams();
  params.set("includeInactive", String(Boolean(filters.includeInactive)));
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  return apiFetch(`/admin/products?${params.toString()}`);
}

export function createProduct(payload) {
  return apiFetch("/admin/products", {
    method: "POST",
    body: payload
  });
}

export function updateProduct(productId, payload) {
  return apiFetch(`/admin/products/${productId}`, {
    method: "PATCH",
    body: payload
  });
}

export function archiveProduct(productId) {
  return apiFetch(`/admin/products/${productId}`, {
    method: "DELETE"
  });
}

export function uploadProductImage(productId, file) {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch(`/admin/products/${productId}/images`, {
    method: "POST",
    body: formData
  });
}
