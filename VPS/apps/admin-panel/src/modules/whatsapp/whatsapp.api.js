import { apiFetch } from "../../shared/api/http-client";

export function fetchWhatsappStatus() {
  return apiFetch("/admin/whatsapp/status");
}

export function connectWhatsapp() {
  return apiFetch("/admin/whatsapp/connect", { method: "POST" });
}

export function disconnectWhatsapp() {
  return apiFetch("/admin/whatsapp/disconnect", { method: "POST" });
}
