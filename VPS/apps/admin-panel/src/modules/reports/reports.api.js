import { API_BASE_URL, ApiError, apiFetch } from "../../shared/api/http-client";
import { clearAuthSession, getAuthSession } from "../auth/auth.store";

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

async function parseDownloadError(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    return payload?.message || payload?.error || "Download failed.";
  }

  const text = await response.text();
  return text || "Download failed.";
}

export function fetchReport(reportKey, filters = {}) {
  const query = buildQuery(filters);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/reports/${reportKey}${suffix}`);
}

export async function downloadReport(reportKey, filters = {}, format = "csv") {
  const session = getAuthSession();
  const query = buildQuery({
    ...filters,
    format
  });
  const response = await fetch(
    `${API_BASE_URL}/admin/reports/${reportKey}/export?${query}`,
    {
      headers: session?.accessToken
        ? {
            Authorization: `Bearer ${session.accessToken}`
          }
        : {}
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthSession();
    }

    throw new ApiError(await parseDownloadError(response), response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);

  return {
    blob,
    fileName: match ? match[1] : `${reportKey}.${format}`,
    contentType: response.headers.get("content-type") || ""
  };
}
