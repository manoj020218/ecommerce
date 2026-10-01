import { apiFetch } from "../../shared/api/http-client";

// Dealer registration (2026-10-01)
export function getDealerFormOptions() {
  return apiFetch("/dealers/form-options");
}

export function registerDealer(payload) {
  return apiFetch("/dealers/register", { method: "POST", body: payload });
}
