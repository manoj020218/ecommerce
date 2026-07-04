import { apiFetch } from "../../shared/api/http-client";

export function fetchCategories(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.parentCategoryId) {
    params.set("parentCategoryId", filters.parentCategoryId);
  }
  params.set("includeInactive", String(Boolean(filters.includeInactive)));
  return apiFetch(`/admin/categories?${params.toString()}`);
}

export function createCategory(payload) {
  return apiFetch("/admin/categories", {
    method: "POST",
    body: payload
  });
}

export function updateCategory(categoryId, payload) {
  return apiFetch(`/admin/categories/${categoryId}`, {
    method: "PATCH",
    body: payload
  });
}

export function archiveCategory(categoryId) {
  return apiFetch(`/admin/categories/${categoryId}`, {
    method: "DELETE"
  });
}

export function uploadCategoryImage(categoryId, file) {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch(`/admin/categories/${categoryId}/image`, {
    method: "POST",
    body: fd
  });
}
