import { apiFetch } from "../../shared/api/http-client";

// Projects / Solutions (2026-09-28)
export function listProjects() {
  return apiFetch("/projects");
}

export function getProject(slug) {
  return apiFetch(`/projects/${encodeURIComponent(slug)}`);
}

export function submitProjectEnquiry(slug, payload) {
  return apiFetch(`/projects/${encodeURIComponent(slug)}/enquiry`, { method: "POST", body: payload });
}
