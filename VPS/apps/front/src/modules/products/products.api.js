import { apiFetch } from "../../shared/api/http-client";
import { getOrCreateGuestSessionId } from "../../shared/cart/guest-session";

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

export function listProducts(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  if (params.availability) query.set("availability", params.availability);
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch(`/products${suffix}`, { auth: true });
}

export function listCategories() {
  return apiFetch("/categories");
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

export function getCart(params = {}) {
  const query = buildQuery(params);
  return apiFetch(query ? `/cart?${query}` : "/cart", { auth: true });
}

export function getCustomerCart() {
  return getCart();
}

export function addCartItem(payload) {
  return apiFetch("/cart/items", {
    method: "POST",
    auth: true,
    body: { sessionId: getOrCreateGuestSessionId(), ...payload }
  });
}

export function updateCartItem(productId, payload) {
  return apiFetch(`/cart/items/${productId}`, {
    method: "PATCH",
    auth: true,
    body: { sessionId: getOrCreateGuestSessionId(), ...payload }
  });
}

export function deleteCartItem(productId, params = {}) {
  const sessionId = getOrCreateGuestSessionId();
  const query = buildQuery({ sessionId, ...params });
  return apiFetch(query ? `/cart/items/${productId}?${query}` : `/cart/items/${productId}`, {
    method: "DELETE",
    auth: true
  });
}

export function mergeGuestCart(guestSessionId) {
  return apiFetch("/cart/merge", {
    method: "POST",
    auth: true,
    body: { guestSessionId }
  });
}

export function startCheckout(payload) {
  return apiFetch("/checkout/start", {
    method: "POST",
    auth: true,
    body: payload
  });
}

export function getCheckoutSession(checkoutSessionId, params = {}) {
  const query = buildQuery(params);
  return apiFetch(
    query ? `/checkout/${checkoutSessionId}?${query}` : `/checkout/${checkoutSessionId}`,
    { auth: true }
  );
}

export function getCheckoutOrderFollowup(checkoutSessionId, params = {}) {
  const query = buildQuery(params);
  return apiFetch(
    query
      ? `/checkout/${checkoutSessionId}/follow-up?${query}`
      : `/checkout/${checkoutSessionId}/follow-up`,
    { auth: true }
  );
}

export function downloadCheckoutInvoice(checkoutSessionId, params = {}) {
  const query = buildQuery(params);
  return apiFetch(
    query
      ? `/checkout/${checkoutSessionId}/invoice?${query}`
      : `/checkout/${checkoutSessionId}/invoice`,
    { auth: true }
  );
}

export function listOnlineGateways() {
  return apiFetch("/payments/online-gateways");
}

export function createPaymentAttempt(payload) {
  return apiFetch("/payments/create-attempt", {
    method: "POST",
    auth: true,
    body: payload
  });
}

export function cancelPaymentAttempt(payload) {
  return apiFetch("/payments/cancel-attempt", {
    method: "POST",
    auth: true,
    body: payload
  });
}

export function confirmRazorpayPayment(payload) {
  return apiFetch("/payments/razorpay-confirm", {
    method: "POST",
    body: payload
  });
}

export function confirmCashfreePayment(payload) {
  return apiFetch("/payments/cashfree-confirm", {
    method: "POST",
    body: payload
  });
}

export function getManualGatewayInfo(method) {
  return apiFetch(`/payments/manual/info?method=${encodeURIComponent(method || "")}`);
}
