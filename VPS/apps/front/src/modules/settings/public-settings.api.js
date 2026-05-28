import { apiFetch } from "../../shared/api/http-client";

export function fetchPublicSettings() {
  return apiFetch("/settings/bootstrap");
}
