import { apiFetch } from "../../shared/api/http-client";

export function fetchSetupWizard() {
  return apiFetch("/admin/setup-wizard");
}

export function saveSetupWizardStep(stepKey, payload) {
  return apiFetch(`/admin/setup-wizard/steps/${stepKey}`, {
    method: "PUT",
    body: payload
  });
}

export function completeSetupWizard() {
  return apiFetch("/admin/setup-wizard/complete", {
    method: "POST",
    body: {}
  });
}
