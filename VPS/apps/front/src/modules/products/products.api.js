import { apiFetch } from "../../shared/api/http-client";

export function listProducts(params = {}) {
  const query = new URLSearchParams();
  if (params.q) {
    query.set("q", params.q);
  }
  if (params.categoryId) {
    query.set("categoryId", params.categoryId);
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch(`/products${suffix}`);
}

export function searchStorefront(params = {}) {
  const query = new URLSearchParams();
  if (params.q) {
    query.set("q", params.q);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  if (params.sessionId) {
    query.set("sessionId", params.sessionId);
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch(`/search${suffix}`, { auth: true });
}

export function getProduct(slug) {
  return apiFetch(`/products/${slug}`);
}

export function getProductPageBundle(slug) {
  return apiFetch(
    `/products/${slug}/page?limitPerGroup=10&historyLimit=10`,
    { auth: true }
  );
}

export function getProductRecommendations(slug) {
  return apiFetch(
    `/products/${slug}/recommendations?limitPerGroup=10&historyLimit=10`,
    { auth: true }
  );
}

export function estimateShipping(slug, payload) {
  return apiFetch(`/products/${slug}/shipping-estimate`, {
    method: "POST",
    body: payload
  });
}

export function requestNotifyWhenAvailable(payload) {
  return apiFetch("/marketing/notify-when-available", {
    method: "POST",
    auth: true,
    body: payload
  });
}
