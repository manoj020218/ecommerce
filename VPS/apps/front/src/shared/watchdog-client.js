/**
 * Lightweight Commerce Watchdog client for Jenix storefront.
 * Sends pipeline events to the Watchdog API without any npm dependency.
 */

const API_URL = import.meta.env.VITE_WATCHDOG_API_URL || "";
const API_KEY = import.meta.env.VITE_WATCHDOG_API_KEY || "";
const STORE_ID = "jenixindia";
const FLUSH_MS = 3000;

let queue = [];
let timer = null;

function randomId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getVisitorId() {
  let id = localStorage.getItem("cw_visitor");
  if (!id) { id = randomId(); localStorage.setItem("cw_visitor", id); }
  return id;
}

function getSessionId() {
  let id = sessionStorage.getItem("cw_session");
  if (!id) { id = randomId(); sessionStorage.setItem("cw_session", id); }
  return id;
}

function isEnabled() {
  return Boolean(API_URL && API_KEY);
}

async function flush() {
  if (!isEnabled() || queue.length === 0) return;
  const batch = queue.splice(0, 50);
  try {
    await fetch(`${API_URL}/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-watchdog-api-key": API_KEY },
      body: JSON.stringify({ storeId: STORE_ID, events: batch }),
      keepalive: true,
    });
  } catch (_err) {
    // Silently discard — monitoring must never affect buyer experience
  }
}

function startTimer() {
  if (!timer) timer = setInterval(flush, FLUSH_MS);
}

function track(stage, extra = {}) {
  if (!isEnabled()) return;
  startTimer();
  queue.push({
    eventId: randomId(),
    storeId: STORE_ID,
    stage,
    sessionId: getSessionId(),
    visitorId: getVisitorId(),
    timestamp: new Date().toISOString(),
    url: window.location.href,
    ...extra,
  });
  // Flush immediately for critical payment stages
  if (["PAYMENT_INITIATED", "PAYMENT_SUCCESS", "PAYMENT_FAILED", "ORDER_CREATED"].includes(stage)) {
    flush();
  }
}

// Flush on page unload
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

export const watchdog = {
  trackProductView: (productId) =>
    track("PRODUCT_VIEWED", { productId }),

  trackAddToCartClick: (productId) =>
    track("ADD_TO_CART_CLICKED", { productId }),

  trackAddToCartSuccess: (productId, cartId) =>
    track("ADD_TO_CART_SUCCESS", { productId, cartId }),

  trackCartView: (cartId, cartValue) =>
    track("CART_VIEWED", { cartId, metadata: { cartValue } }),

  trackCheckoutStarted: (cartId) =>
    track("CHECKOUT_STARTED", { cartId }),

  trackAddressSubmitted: (cartId) =>
    track("ADDRESS_SUBMITTED", { cartId }),

  trackPaymentInitiated: (cartId, paymentAttemptId) =>
    track("PAYMENT_INITIATED", { cartId, paymentAttemptId }),

  trackPaymentSuccess: (cartId, orderId, paymentAttemptId) =>
    track("PAYMENT_SUCCESS", { cartId, orderId, paymentAttemptId }),

  // No prior stage covered a payment attempt dying client-side (gateway
  // script hang, modal dismissed, payment declined) — the funnel only ever
  // saw PAYMENT_INITIATED and then silence, which is why a real stuck order
  // never surfaced on the dashboard. This closes that gap going forward.
  trackPaymentFailed: (cartId, paymentAttemptId, reason) =>
    track("PAYMENT_FAILED", { cartId, paymentAttemptId, metadata: { reason: String(reason || "") } }),

  trackOrderCreated: (orderId, cartId) =>
    track("ORDER_CREATED", { orderId, cartId }),

  trackOrderConfirmed: (orderId) =>
    track("ORDER_CONFIRMED", { orderId }),

  trackCompleted: (orderId) =>
    track("COMPLETED", { orderId }),

  trackError: (message, error, meta = {}) =>
    track("COMPLETED", {
      errorMessage: message,
      errorStack: error?.stack,
      metadata: meta,
    }),
};
