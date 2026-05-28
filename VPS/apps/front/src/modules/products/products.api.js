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
  return apiFetch(`/products${suffix}`, { auth: true });
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
  return apiFetch(`/products/${slug}`, { auth: true });
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

export function getCustomerCart() {
  return apiFetch("/cart", { auth: true });
}

export function addCartItem(payload) {
  return apiFetch("/cart/items", {
    method: "POST",
    auth: true,
    body: payload
  });
}

export function updateCartItem(productId, payload) {
  return apiFetch(`/cart/items/${productId}`, {
    method: "PATCH",
    auth: true,
    body: payload
  });
}

export function deleteCartItem(productId) {
  return apiFetch(`/cart/items/${productId}`, {
    method: "DELETE",
    auth: true
  });
}

export function startCheckout(payload) {
  return apiFetch("/checkout/start", {
    method: "POST",
    auth: true,
    body: payload
  });
}
