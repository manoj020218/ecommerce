import { apiFetch } from "../../shared/api/http-client";

export function fetchCatalogueSummary() {
  return apiFetch("/admin/catalogue/summary");
}

export function exportCatalogueProducts(includeInactive = false) {
  const query = includeInactive ? "?includeInactive=true" : "";
  return apiFetch(`/admin/catalogue/export/products${query}`);
}

export function importProductsPlaceholder() {
  return apiFetch("/admin/catalogue/import/products", {
    method: "POST",
    body: {}
  });
}
