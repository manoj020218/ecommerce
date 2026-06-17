import { apiFetch } from "../../shared/api/http-client";

export function fetchPaymentGateways() {
  return apiFetch("/admin/payment-gateways");
}

export function fetchPaymentGatewayConfig(gatewayCode) {
  return apiFetch(`/admin/payment-gateways/${gatewayCode}`);
}

export function updatePaymentGatewayConfig(gatewayCode, payload) {
  return apiFetch(`/admin/payment-gateways/${gatewayCode}`, {
    method: "PATCH",
    body: payload
  });
}

export function updateDirectPaymentDiscount(payload) {
  return apiFetch("/admin/payment-gateways/discount/direct-payment", {
    method: "PATCH",
    body: payload
  });
}
