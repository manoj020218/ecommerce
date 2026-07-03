import { apiFetch } from "../../shared/api/http-client";

export function getGoogleAuthConfig() {
  return apiFetch("/auth/public/google-config");
}

export function exchangeGoogleCode(payload) {
  return apiFetch("/auth/customer/google-exchange", {
    method: "POST",
    body: payload
  });
}
