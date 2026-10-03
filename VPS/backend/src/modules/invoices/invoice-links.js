// Shareable invoice PDF links (2026-10-03). The link carries the invoice id
// plus an HMAC signature made with the server's secret, so it opens without
// login but can't be guessed or changed to another invoice. Nothing is
// stored — the signature is recomputed on every request.

const crypto = require("node:crypto");
const { env } = require("../../config/env");

function signInvoiceId(invoiceId) {
  return crypto
    .createHmac("sha256", `${env.jwtRefreshSecret}:invoice-pdf-link`)
    .update(String(invoiceId || ""))
    .digest("base64url")
    .slice(0, 32);
}

function isValidInvoiceSignature(invoiceId, signature) {
  const expected = signInvoiceId(invoiceId);
  const given = String(signature || "");
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function buildInvoicePdfUrl(invoiceId, { download = false } = {}) {
  if (!invoiceId) return "";
  const base = String(env.publicBaseUrl || "").replace(/\/$/, "");
  return `${base}/api/invoice-pdf/${encodeURIComponent(invoiceId)}/${signInvoiceId(invoiceId)}${download ? "?download=1" : ""}`;
}

module.exports = { signInvoiceId, isValidInvoiceSignature, buildInvoicePdfUrl };
