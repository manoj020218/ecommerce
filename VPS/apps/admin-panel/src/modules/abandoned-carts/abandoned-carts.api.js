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

export function fetchAbandonedCartSummary() {
  return apiFetch("/admin/abandoned-carts/summary");
}

export function fetchAbandonedCartRecoveries(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/abandoned-carts${suffix}`);
}

export function fetchAbandonedCartRecovery(recoveryId) {
  return apiFetch(`/admin/abandoned-carts/${recoveryId}`);
}

export function runAbandonedCartReminders(payload = {}) {
  return apiFetch("/admin/abandoned-carts/reminders/run", {
    method: "POST",
    body: payload
  });
}
