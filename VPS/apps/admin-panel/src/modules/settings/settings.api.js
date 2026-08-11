import { apiFetch } from "../../shared/api/http-client";

export function fetchSettings() {
  return apiFetch("/admin/settings");
}

export function updateStoreProfile(payload) {
  return apiFetch("/admin/settings/store-profile", {
    method: "PUT",
    body: payload
  });
}

export function updateBranding(payload) {
  return apiFetch("/admin/settings/branding", {
    method: "PUT",
    body: payload
  });
}

export function uploadBrandingAsset(assetKey, file) {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch(`/admin/settings/branding/upload/${assetKey}`, {
    method: "POST",
    body: formData
  });
}

export function updateSeoDefaults(payload) {
  return apiFetch("/admin/settings/seo-defaults", {
    method: "PUT",
    body: payload
  });
}

export function updateContactInformation(payload) {
  return apiFetch("/admin/settings/contact-information", {
    method: "PUT",
    body: payload
  });
}

export function updateCustomCode(payload) {
  return apiFetch("/admin/settings/custom-code", {
    method: "PUT",
    body: payload
  });
}

export function updateInvoiceSettings(payload) {
  return apiFetch("/admin/settings/invoice-settings", {
    method: "PUT",
    body: payload
  });
}

export function updateWhatsappAutomation(payload) {
  return apiFetch("/admin/settings/whatsapp-automation", {
    method: "PUT",
    body: payload
  });
}
