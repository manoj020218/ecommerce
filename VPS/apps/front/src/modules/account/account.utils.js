export function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

export function formatDate(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function humanizeStatus(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/_/g, " ");

  if (!normalized) {
    return "--";
  }

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatAddress(address = {}) {
  return [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.pincode,
    address.country
  ]
    .filter(Boolean)
    .join(", ");
}

export function downloadInvoicePayload(payload) {
  const blob = new Blob(
    [
      payload?.content ||
        JSON.stringify(payload?.invoice || payload || {}, null, 2)
    ],
    {
      type: payload?.contentType || "text/html;charset=utf-8"
    }
  );
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = payload.fileName || "invoice.html";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}

export function canSubmitManualPaymentProof(order) {
  if (!order) {
    return false;
  }

  const paymentMethod = String(order.paymentMethod || "").trim().toLowerCase();
  const paymentStatus = String(order.paymentStatus || "").trim().toLowerCase();
  const orderStatus = String(order.orderStatus || "").trim().toLowerCase();
  const manualPaymentStatus = String(order.manualPaymentStatus || "")
    .trim()
    .toLowerCase();

  if (!["direct_bank_transfer", "manual_upi"].includes(paymentMethod)) {
    return false;
  }

  if (paymentStatus === "paid") {
    return false;
  }

  if (["submitted", "verified"].includes(manualPaymentStatus)) {
    return false;
  }

  if (order.isB2BOrderRequest) {
    return orderStatus === "awaiting_bank_payment";
  }

  return true;
}

export function getSupportWhatsappLink(phone, message) {
  if (!phone) {
    return "";
  }

  const digits = String(phone).replace(/[^\d+]/g, "");
  return `https://wa.me/${digits.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}
