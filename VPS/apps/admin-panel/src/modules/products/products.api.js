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

export function fetchProduct(productId) {
  return apiFetch(`/admin/products/${productId}`);
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

export function deleteProduct(productId) {
  return apiFetch(`/admin/products/${productId}/permanent`, {
    method: "DELETE"
  });
}

export function importProductsFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/admin/products/import-file", {
    method: "POST",
    body: formData // multipart — bypasses JSON body size limit
  });
}

export function bulkImportProducts(items) {
  return apiFetch("/admin/products/bulk-import", {
    method: "POST",
    body: items
  });
}

export function bulkPatchProducts(updates) {
  return apiFetch("/admin/products/bulk-patch", {
    method: "PATCH",
    body: { updates }
  });
}

export function uploadProductImage(productId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(`/admin/products/${productId}/images`, { method: "POST", body: formData });
}

export function deleteProductImage(productId, imageUrl) {
  return apiFetch(`/admin/products/${productId}/images`, {
    method: "DELETE",
    body: { imageUrl }
  });
}

export function uploadProductVideo(productId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(`/admin/products/${productId}/videos`, { method: "POST", body: formData });
}

export function uploadProductDocument(productId, title, file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);
  return apiFetch(`/admin/products/${productId}/documents`, { method: "POST", body: formData });
}

export function getGoogleShoppingExportUrl(apiBase) {
  // Returns the direct download URL (used as href, not apiFetch)
  return `${apiBase}/admin/products/google-shopping-export`;
}
