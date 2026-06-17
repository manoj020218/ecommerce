import { apiFetch } from "../../shared/api/http-client";

export function fetchStaffUsers() {
  return apiFetch("/admin/staff");
}

export function createStaffUser(payload) {
  return apiFetch("/admin/staff", {
    method: "POST",
    body: payload
  });
}

export function updateStaffUser(staffId, payload) {
  return apiFetch(`/admin/staff/${staffId}`, {
    method: "PATCH",
    body: payload
  });
}

export function updateStaffPassword(staffId, newPassword) {
  return apiFetch(`/admin/staff/${staffId}/password`, {
    method: "PATCH",
    body: {
      newPassword
    }
  });
}
