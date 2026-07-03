import { clearAuthSession, getAuthSession, setAuthSession } from "../../modules/auth/auth.store";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4100/api";

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

  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`;
  }

  return `${API_BASE_URL}${path}`;
}

function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return response.text().then((text) => ({ raw: text }));
  }
  return response.json();
}

// Mutex prevents multiple concurrent refresh attempts when several API calls 401 at once
let pendingRefresh = null;

async function silentRefresh() {
  if (pendingRefresh) return pendingRefresh;

  pendingRefresh = (async () => {
    const session = getAuthSession();
    if (!session?.refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken })
      });

      if (!response.ok) return null;

      const data = await response.json();
      const newSession = data?.data ?? data;
      if (!newSession?.accessToken) return null;

      setAuthSession(newSession);
      return newSession;
    } catch {
      return null;
    }
  })();

  try {
    return await pendingRefresh;
  } finally {
    pendingRefresh = null;
  }
}

export async function apiFetch(path, options = {}) {
  const { auth = true, body, headers, _retry = false, ...rest } = options;
  const session = getAuthSession();
  const requestHeaders = new Headers(headers || {});

  if (auth && session?.accessToken) {
    requestHeaders.set("Authorization", `Bearer ${session.accessToken}`);
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
    if (response.status === 401 && auth && !_retry) {
      // Try silent token refresh before logging out
      const newSession = await silentRefresh();
      if (newSession) {
        return apiFetch(path, { ...options, _retry: true });
      }
      clearAuthSession();
    }

    const message =
      payload?.message ||
      payload?.error ||
      `Request failed with status ${response.status}.`;
    throw new ApiError(message, response.status, payload);
  }

  return payload?.data ?? payload;
}

export { ApiError, API_BASE_URL };
