import { apiFetch } from "../../shared/api/http-client";

export function fetchDashboardStats() {
  return apiFetch("/admin/dashboard");
}

// range: "week" | "month" | "year"
export function fetchOrderTrend(range) {
  return apiFetch(`/admin/dashboard/trend?range=${encodeURIComponent(range)}`);
}

// range: "7d" | "30d" | "90d" | "365d"
export function fetchProductPerformance(range, limit = 50) {
  return apiFetch(
    `/admin/dashboard/product-performance?range=${encodeURIComponent(range)}&limit=${limit}`
  );
}
