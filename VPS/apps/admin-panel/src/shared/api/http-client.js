import { clearAuthSession, getAuthSession } from "../../modules/auth/auth.store";

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

export async function apiFetch(path, options = {}) {
  const { auth = true, body, headers, ...rest } = options;
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
    if (response.status === 401 && auth) {
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
