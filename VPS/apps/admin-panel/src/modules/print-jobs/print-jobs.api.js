import { apiFetch, API_BASE_URL } from "../../shared/api/http-client";
import { getAuthSession } from "../auth/auth.store";

export function fetchPrintJobs(params = {}) {
  const query = new URLSearchParams();
  if (params.status) {
    query.set("status", params.status);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch(`/admin/print-jobs${suffix}`);
}

export function fetchPrintJob(orderId, lineId) {
  return apiFetch(`/admin/print-jobs/${orderId}/${lineId}`);
}

export function moderatePrintJob(orderId, lineId, payload) {
  return apiFetch(`/admin/print-jobs/${orderId}/${lineId}/moderate`, {
    method: "PATCH",
    body: payload
  });
}

// The file-serve route requires a Bearer token (never a public URL, see
// backend's print-uploads.routes.js) -- a plain <img src> can't attach that
// header, so this fetches the bytes with the same auth apiFetch uses and
// hands back a blob: URL the caller must revoke when done with it.
export async function fetchPrintUploadPreviewUrl(uploadId) {
  const session = getAuthSession();
  const response = await fetch(
    `${API_BASE_URL}/admin/print-uploads/${uploadId}/file?inline=1`,
    {
      headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to load file (${response.status}).`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
