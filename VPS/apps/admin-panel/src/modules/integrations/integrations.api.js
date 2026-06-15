import { apiFetch } from "../../shared/api/http-client";

export function fetchIntegrations() {
  return apiFetch("/admin/integrations");
}

export function updateIntegration(code, payload) {
  return apiFetch(`/admin/integrations/${code}`, {
    method: "PATCH",
    body: payload
  });
}
