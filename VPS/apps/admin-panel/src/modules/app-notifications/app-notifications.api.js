import { apiFetch } from "../../shared/api/http-client";

// App push notifications admin API (2026-10-03)
export function fetchAppNotificationSummary() {
  return apiFetch("/admin/push");
}

export function sendAppNotification(payload) {
  return apiFetch("/admin/push/send", { method: "POST", body: payload });
}
