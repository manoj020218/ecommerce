import { apiFetch } from "../../shared/api/http-client";

export function listPublicPages() {
  return apiFetch("/pages");
}

export function getPublicPage(slug) {
  return apiFetch(`/pages/${encodeURIComponent(slug)}`);
}
