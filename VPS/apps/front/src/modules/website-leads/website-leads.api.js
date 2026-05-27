import { apiFetch } from "../../shared/api/http-client";

export function createWebsiteLead(payload) {
  return apiFetch("/website-leads", {
    method: "POST",
    body: payload
  });
}
