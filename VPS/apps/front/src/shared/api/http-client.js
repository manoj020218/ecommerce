const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4100/api";

// A stored token can outlive its actual server-side validity (natural JWT
// expiry) without ever being cleared client-side, since isAuthenticated only
// checks that a token string exists. Any authenticated call that comes back
// 401 dispatches this so the session can be cleared everywhere at once,
// instead of every caller having to notice and handle a stale session itself.
export const SESSION_EXPIRED_EVENT = "jenix:customer-session-expired";

// Fired after ensureFreshAccessToken() silently rotates the access token in
// the background, so CustomerSessionProvider's in-memory session (and things
// like the stored refreshToken used for an explicit logout) stay in sync
// with what's now on disk instead of going stale for the rest of the tab's
// life.
export const SESSION_REFRESHED_EVENT = "jenix:customer-session-refreshed";

const SESSION_STORAGE_KEY = "jenix.front.customerSession";
const LEGACY_TOKEN_KEY = "jenix.front.customerToken";

// Access tokens are short-lived (15m) and a checkout/account tab is routinely
// left open in a background browser tab for days. A setTimeout-scheduled
// refresh is not reliable across that -- background tabs get their timers
// throttled or fully suspended, and the timer is lost entirely on a tab
// discard/reload. So instead of scheduling ahead, every authenticated
// request checks the token it's about to send and refreshes first if it's
// expired or about to be, no matter how long the tab was sitting idle.
const REFRESH_SKEW_MS = 30 * 1000;

function decodeJwtExpiryMs(token) {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) {
      return null;
    }
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch (_error) {
    return null;
  }
}

function readStoredCustomerSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function writeRefreshedCustomerSession(nextSession) {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    window.localStorage.setItem(LEGACY_TOKEN_KEY, nextSession.accessToken);
  } catch (_error) {
    // Ignore storage write failures in restricted environments.
  }
}

let refreshInFlight = null;

async function ensureFreshAccessToken() {
  const stored = readStoredCustomerSession();
  if (!stored?.accessToken || !stored?.refreshToken) {
    return;
  }

  const expiresAt = decodeJwtExpiryMs(stored.accessToken);
  if (expiresAt === null || expiresAt - Date.now() > REFRESH_SKEW_MS) {
    return;
  }

  if (!refreshInFlight) {
    refreshInFlight = apiFetch("/auth/customer/refresh", {
      method: "POST",
      body: { refreshToken: stored.refreshToken }
    })
      .then((data) => {
        if (!data?.accessToken) {
          return null;
        }
        const nextSession = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || stored.refreshToken,
          customer: data.customer || stored.customer || null
        };
        writeRefreshedCustomerSession(nextSession);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(SESSION_REFRESHED_EVENT, { detail: nextSession })
          );
        }
        return nextSession;
      })
      .catch(() => {
        // Refresh tokens are single-use/rotated server-side (see
        // auth.service.js refreshSession). Two tabs racing a refresh with
        // the same soon-to-expire access token both read the same
        // refreshToken from shared localStorage; whichever request the
        // backend processes second gets "refresh session already revoked"
        // even though nothing is actually wrong with this tab's session --
        // the other tab just won the race first. Before treating this as a
        // real failure, check whether that's what happened: if storage now
        // holds a *different*, still-valid access token (written by the
        // winning tab in the meantime), just adopt it instead of forcing an
        // incorrect logout.
        const latest = readStoredCustomerSession();
        if (
          latest?.accessToken &&
          latest.accessToken !== stored.accessToken &&
          (decodeJwtExpiryMs(latest.accessToken) ?? 0) - Date.now() > REFRESH_SKEW_MS
        ) {
          return latest;
        }
        // Otherwise a genuine failure (refresh token itself expired/revoked,
        // or a network hiccup) -- the original request proceeds with the old
        // token and, if it's genuinely dead, the existing 401 ->
        // SESSION_EXPIRED_EVENT path takes over from there.
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  await refreshInFlight;
}

class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildUrl(path) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("/")) {
    return `${API_BASE_URL}${path}`;
  }
  return `${API_BASE_URL}/${path}`;
}

function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return response.text().then((raw) => ({ raw }));
  }
  return response.json();
}

function getCustomerToken() {
  try {
    const rawSession = window.localStorage.getItem("jenix.front.customerSession");
    if (rawSession) {
      const session = JSON.parse(rawSession);
      if (session?.accessToken) {
        return session.accessToken;
      }
    }
  } catch (_error) {
    // Ignore malformed session payloads and fall back to the legacy key.
  }

  try {
    return window.localStorage.getItem("jenix.front.customerToken");
  } catch (_error) {
    return null;
  }
}

// Bare fetch() never times out on its own -- on a flaky mobile connection a
// stalled request just hangs forever, and every busy/submitting state
// gating a button (Pay Now, Place Order, Add to Cart, Refresh Totals) waits
// on this promise settling, so the button freezes with zero feedback,
// indefinitely. This is the same *symptom* as the expired-token bug already
// fixed elsewhere, but a much more common trigger.
const REQUEST_TIMEOUT_MS = 25000;

export async function apiFetch(path, options = {}) {
  const { body, auth = false, headers, signal: callerSignal, ...rest } = options;
  const requestHeaders = new Headers(headers || {});

  if (auth) {
    await ensureFreshAccessToken();
    const token = getCustomerToken();
    if (token) {
      requestHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  let requestBody = body;
  if (body && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  if (callerSignal) {
    if (callerSignal.aborted) {
      timeoutController.abort();
    } else {
      callerSignal.addEventListener("abort", () => timeoutController.abort(), { once: true });
    }
  }

  let response;
  try {
    response = await fetch(buildUrl(path), {
      ...rest,
      headers: requestHeaders,
      body: requestBody,
      signal: timeoutController.signal
    });
  } catch (fetchError) {
    if (fetchError.name === "AbortError") {
      throw new ApiError(
        "Request timed out. Please check your connection and try again.",
        0,
        null
      );
    }
    throw fetchError;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Request failed with status ${response.status}.`;

    if (auth && response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }

    throw new ApiError(message, response.status, payload);
  }

  return payload?.data ?? payload;
}

export { ApiError, API_BASE_URL };
