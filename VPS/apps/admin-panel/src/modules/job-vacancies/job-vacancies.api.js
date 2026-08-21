import { apiFetch } from "../../shared/api/http-client";

export function fetchJobVacancies(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set("q", filters.q);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }

  const query = params.toString();
  return apiFetch(`/admin/job-vacancies${query ? `?${query}` : ""}`);
}

export function fetchJobVacancy(jobId) {
  return apiFetch(`/admin/job-vacancies/${jobId}`);
}

export function createJobVacancy(payload) {
  return apiFetch("/admin/job-vacancies", {
    method: "POST",
    body: payload
  });
}

export function updateJobVacancy(jobId, payload) {
  return apiFetch(`/admin/job-vacancies/${jobId}`, {
    method: "PATCH",
    body: payload
  });
}

export function closeJobVacancy(jobId) {
  return apiFetch(`/admin/job-vacancies/${jobId}`, {
    method: "DELETE"
  });
}
