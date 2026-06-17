import { apiFetch } from "../../shared/api/http-client";

export function fetchDashboardStats() {
  return apiFetch("/admin/dashboard");
}
