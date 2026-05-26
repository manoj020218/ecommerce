import { apiFetch } from "../../shared/api/http-client";

export function adminLogin(payload) {
  return apiFetch("/auth/admin/login", {
    method: "POST",
    body: payload,
    auth: false
  });
}

export function adminMe() {
  return apiFetch("/auth/admin/me");
}

export function adminRefresh(refreshToken) {
  return apiFetch("/auth/admin/refresh", {
    method: "POST",
    body: { refreshToken },
    auth: false
  });
}

export function adminLogout(refreshToken) {
  return apiFetch("/auth/admin/logout", {
    method: "POST",
    body: { refreshToken }
  });
}
