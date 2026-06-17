import { apiFetch } from "../../shared/api/http-client";

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    query.set(key, String(value));
  });

  return query.toString();
}

function withQuery(path, params = {}) {
  const query = buildQuery(params);
  return query ? `${path}?${query}` : path;
}

export function fetchSearchOverview() {
  return apiFetch("/admin/search/overview");
}

export function fetchSearchSynonyms(params = {}) {
  return apiFetch(withQuery("/admin/search/synonyms", params));
}

export function createSearchSynonym(payload) {
  return apiFetch("/admin/search/synonyms", {
    method: "POST",
    body: payload
  });
}

export function archiveSearchSynonym(synonymId) {
  return apiFetch(`/admin/search/synonyms/${synonymId}`, {
    method: "DELETE"
  });
}

export function fetchBuyerPhraseMappings(params = {}) {
  return apiFetch(withQuery("/admin/search/buyer-phrases", params));
}

export function createBuyerPhraseMapping(payload) {
  return apiFetch("/admin/search/buyer-phrases", {
    method: "POST",
    body: payload
  });
}

export function archiveBuyerPhraseMapping(mappingId) {
  return apiFetch(`/admin/search/buyer-phrases/${mappingId}`, {
    method: "DELETE"
  });
}

export function fetchProductKeywordMappings(params = {}) {
  return apiFetch(withQuery("/admin/search/product-keywords", params));
}

export function createProductKeywordMapping(payload) {
  return apiFetch("/admin/search/product-keywords", {
    method: "POST",
    body: payload
  });
}

export function archiveProductKeywordMapping(mappingId) {
  return apiFetch(`/admin/search/product-keywords/${mappingId}`, {
    method: "DELETE"
  });
}

export function fetchSearchRedirects(params = {}) {
  return apiFetch(withQuery("/admin/search/redirects", params));
}

export function createSearchRedirect(payload) {
  return apiFetch("/admin/search/redirects", {
    method: "POST",
    body: payload
  });
}

export function archiveSearchRedirect(redirectId) {
  return apiFetch(`/admin/search/redirects/${redirectId}`, {
    method: "DELETE"
  });
}

export function fetchSearchLogs(params = {}) {
  return apiFetch(withQuery("/admin/search/logs", params));
}

export function fetchZeroResultSearches(params = {}) {
  return apiFetch(withQuery("/admin/search/zero-results", params));
}

export function reindexSearch() {
  return apiFetch("/admin/search/reindex", {
    method: "POST",
    body: {}
  });
}
