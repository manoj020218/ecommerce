const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4100/api";

// A stored token can outlive its actual server-side validity (natural JWT
// expiry) without ever being cleared client-side, since isAuthenticated only
// checks that a token string exists. Any authenticated call that comes back
// 401 dispatches this so the session can be cleared everywhere at once,
// instead of every caller having to notice and handle a stale session itself.
export const SESSION_EXPIRED_EVENT = "jenix:customer-session-expired";

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

export async function apiFetch(path, options = {}) {
  const { body, auth = false, headers, ...rest } = options;
  const requestHeaders = new Headers(headers || {});

  if (auth) {
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

  const response = await fetch(buildUrl(path), {
    ...rest,
    headers: requestHeaders,
    body: requestBody
  });

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
