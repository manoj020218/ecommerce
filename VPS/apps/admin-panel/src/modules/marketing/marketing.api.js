import { apiFetch } from "../../shared/api/http-client";

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

export function fetchMarketingOverview() {
  return apiFetch("/admin/marketing/overview");
}

export function fetchOffers(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/marketing/offers${suffix}`);
}

export function createOffer(payload) {
  return apiFetch("/admin/marketing/offers", {
    method: "POST",
    body: payload
  });
}

export function updateOffer(offerId, payload) {
  return apiFetch(`/admin/marketing/offers/${offerId}`, {
    method: "PATCH",
    body: payload
  });
}

export function fetchEmailTemplates() {
  return apiFetch("/admin/marketing/email-templates");
}

export function updateEmailTemplate(templateKey, payload) {
  return apiFetch(`/admin/marketing/email-templates/${templateKey}`, {
    method: "PATCH",
    body: payload
  });
}

export function previewEmailTemplate(templateKey, variables) {
  return apiFetch(`/admin/marketing/email-templates/${templateKey}/preview`, {
    method: "POST",
    body: {
      variables
    }
  });
}

export function fetchNotificationLogs(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/marketing/notification-logs${suffix}`);
}
