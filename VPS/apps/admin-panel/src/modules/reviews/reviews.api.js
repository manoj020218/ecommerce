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

export function fetchReviews(params = {}) {
  const query = buildQuery(params);
  const suffix = query ? `?${query}` : "";
  return apiFetch(`/admin/reviews${suffix}`);
}

export function fetchReview(reviewId) {
  return apiFetch(`/admin/reviews/${reviewId}`);
}

export function moderateReview(reviewId, payload) {
  return apiFetch(`/admin/reviews/${reviewId}/moderate`, {
    method: "PATCH",
    body: payload
  });
}

export function deleteReview(reviewId) {
  return apiFetch(`/admin/reviews/${reviewId}`, { method: "DELETE" });
}

export function fetchReviewSettings() {
  return apiFetch(`/admin/settings/review-settings`);
}

export function updateReviewSettings(payload) {
  return apiFetch(`/admin/settings/review-settings`, {
    method: "PUT",
    body: payload
  });
}
