import { apiFetch } from "../../shared/api/http-client";

export function fetchWebsiteLeads(params = {}) {
  const query = new URLSearchParams();

  if (params.q) {
    query.set("q", params.q);
  }
  if (params.status) {
    query.set("status", params.status);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch(`/admin/website-leads${suffix}`);
}

export function updateWebsiteLead(leadId, payload) {
  return apiFetch(`/admin/website-leads/${leadId}`, {
    method: "PATCH",
    body: payload
  });
}
