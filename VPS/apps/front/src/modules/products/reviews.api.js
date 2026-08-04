import { apiFetch } from "../../shared/api/http-client";

export function getProductReviews(productId) {
  const query = new URLSearchParams({ productId }).toString();
  return apiFetch(`/reviews?${query}`);
}

export function submitProductReview(payload) {
  return apiFetch("/reviews", { method: "POST", body: payload, auth: true });
}
