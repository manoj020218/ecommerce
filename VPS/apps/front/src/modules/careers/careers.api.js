import { apiFetch } from "../../shared/api/http-client";

export function listJobVacancies(params = {}) {
  const query = new URLSearchParams();
  if (params.q) {
    query.set("q", params.q);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return apiFetch(`/job-vacancies${suffix}`);
}

export function getJobVacancy(slug) {
  return apiFetch(`/job-vacancies/${slug}`);
}
