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
  const blob = new Blob([JSON.stringify(payload.invoice, null, 2)], {
    type: "application/json"
  });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = downloadUrl;
  link.download = payload.fileName || "invoice.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}

export function getSupportWhatsappLink(phone, message) {
  if (!phone) {
    return "";
  }

  const digits = String(phone).replace(/[^\d+]/g, "");
  return `https://wa.me/${digits.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}

