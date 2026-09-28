import { apiFetch } from "../../shared/api/http-client";

// Projects / Solutions admin API (2026-09-28)
export function fetchProjects() {
  return apiFetch("/admin/projects");
}

export function createProject(payload) {
  return apiFetch("/admin/projects", { method: "POST", body: payload });
}

export function updateProject(projectId, payload) {
  return apiFetch(`/admin/projects/${projectId}`, { method: "PATCH", body: payload });
}

export function uploadProjectImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch("/admin/projects/image", { method: "POST", body: fd });
}

export function fetchProjectEnquiries(filters = {}) {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return apiFetch(`/admin/projects/enquiries${qs ? `?${qs}` : ""}`);
}

export function updateProjectEnquiry(enquiryId, payload) {
  return apiFetch(`/admin/projects/enquiries/${enquiryId}`, { method: "PATCH", body: payload });
}
