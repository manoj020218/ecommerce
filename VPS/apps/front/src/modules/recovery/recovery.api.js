import { apiFetch } from "../../shared/api/http-client";

export function getRecoveryPreview(recoveryToken) {
  return apiFetch(`/recovery/${recoveryToken}`);
}

export function restoreRecoveryCart(recoveryToken, payload, auth = false) {
  return apiFetch(`/recovery/${recoveryToken}/restore`, {
    method: "POST",
    auth,
    body: payload
  });
}

export function saveRecoveryFeedback(recoveryToken, payload) {
  return apiFetch(`/recovery/${recoveryToken}/feedback`, {
    method: "POST",
    body: payload
  });
}
