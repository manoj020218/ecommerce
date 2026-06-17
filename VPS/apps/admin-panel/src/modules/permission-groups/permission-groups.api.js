import { apiFetch } from "../../shared/api/http-client";

export function fetchPermissionGroups() {
  return apiFetch("/admin/roles-permissions");
}

export function fetchAvailablePermissions() {
  return apiFetch("/admin/roles-permissions/available-permissions");
}

export function createPermissionGroup(payload) {
  return apiFetch("/admin/roles-permissions", {
    method: "POST",
    body: payload
  });
}

export function updatePermissionGroup(groupId, payload) {
  return apiFetch(`/admin/roles-permissions/${groupId}`, {
    method: "PATCH",
    body: payload
  });
}
