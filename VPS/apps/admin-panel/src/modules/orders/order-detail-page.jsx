import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthSession } from "../auth/use-auth-session";
import { ErrorBlock } from "../../shared/components/error-block";
import { LoadingBlock } from "../../shared/components/loading-block";
import { Modal } from "../../shared/components/modal";
import { hasPermission } from "../../shared/utils/permissions";
import { formatCurrencyInr, formatDateTime } from "../../shared/utils/formatters";
import {
  fetchOrderDetail,
  updateOrder,
  editOrderItems,
  generateInvoiceForOrder,
  fetchInvoiceForOrder,
  fetchInvoiceDownloadData,
  correctInvoiceBuyer,
  fetchShippingCouriers,
  createShipment,
  updateShipmentTracking,
  updateShipmentStatus,
  uploadShipmentPod,
  sendTrackingEmail,
  fetchManualPaymentsForOrder,
  verifyManualPayment,
  demandManualPayment
} from "./orders.api";
import { searchWalkInProducts } from "../walkin-orders/walkin-orders.api";
import { fetchSettings } from "../settings/settings.api";
import { fetchProduct } from "../products/products.api";
import { API_BASE_URL } from "../../shared/api/http-client";

// Same image-path resolution as products-page.jsx / edit-product-page.jsx —
// order items only snapshot title/sku/price at purchase time, not the image,
// so the current product image is looked up separately by productId.
const BACKEND_BASE = API_BASE_URL.replace(/\/api$/, "");
function resolveOrderItemImageUrl(image) {
  if (!image) return null;
  const src = typeof image === "string" ? image : (image.thumbnail || image.url || "");
  if (!src) return null;
  if (src.startsWith("http")) return src;
  if (src.startsWith("/static")) return `${BACKEND_BASE}${src}`;
  return `${BACKEND_BASE}/static/migration/${src}`;
}

// Mirrors MANUAL_PAYMENT_METHODS in backend/src/modules/orders/orders.service.js —
// only these payment methods are safe to edit items on pre-payment (no risk of
// a gateway webhook confirming the old amount mid-edit).
const EDITABLE_PAYMENT_METHODS = new Set(["direct_bank_transfer", "manual_upi"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanize(v) {
  return String(v || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—";
}

function formatAddress(addr) {
  if (!addr || typeof addr !== "object") return "—";
  return [addr.companyName, addr.name, addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.pincode]
    .filter(Boolean).join(", ") || "—";
}

// Customer mobile numbers are stored as plain 10-digit Indian numbers (no
// country code — checkout never asks for one), so a bare wa.me/<10 digits>
// link fails with WhatsApp's "country code is not fixed" error. Prepends 91
// for a bare 10-digit number and strips a leading trunk "0" if present;
// leaves anything that already carries a country code untouched.
function buildWaLink(phone, message) {
  let digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// ── Shipping label ────────────────────────────────────────────────────────────

function safeAddrStr(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    return [v.addressLine1, v.addressLine2, v.city, v.state, v.pincode].filter(Boolean).join(", ");
  }
  return String(v);
}

function resolveLabelAddressData(order, storeProfile) {
  const storeName = storeProfile?.storeName || "Jenix India";
  const fromAddress = safeAddrStr(storeProfile?.pickupAddress || storeProfile?.address);
  const fromPhone = storeProfile?.supportMobile || storeProfile?.whatsappNumber || "";

  const toAddr = order.shippingAddress || order.billingAddress || {};
  const toName = toAddr.name || order.customerName || "";
  const toCompany = toAddr.companyName || "";
  const toPhone = toAddr.mobile || order.customerMobile || "";
  const toLine1 = toAddr.addressLine1 || "";
  const toLine2 = toAddr.addressLine2 || "";
  const toCityState = [toAddr.city, toAddr.state].filter(Boolean).join(", ");
  const toPincode = toAddr.pincode || "";

  return { storeName, fromAddress, fromPhone, toName, toCompany, toPhone, toLine1, toLine2, toCityState, toPincode };
}

function generateShippingLabelHtml(order, storeProfile, trackingInfo) {
  const {
    storeName, fromAddress, fromPhone, toName, toCompany, toPhone, toLine1, toLine2, toCityState, toPincode
  } = resolveLabelAddressData(order, storeProfile);

  const trackingRows = trackingInfo?.trackingId ? `
    <div class="meta-row"><span>AWB</span><strong>${trackingInfo.trackingId}</strong></div>
    <div class="meta-row"><span>Courier</span><strong>${trackingInfo.courierName || "—"}</strong></div>` : "";

  // Amazon-style: the delivery address dominates the label (large name/address/PIN),
  // the from-address is a small strip up top, order/tracking info is small text at
  // the bottom — courier staff scan the address, not an item list or order box.
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Shipping Label — ${order.orderNo || order.id}</title>
<style>
  @page { size: A6; margin: 5mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  .label { width: 100%; display: flex; flex-direction: column; min-height: 100%; }

  .to-block { flex: 1; }
  .to-tag { font-size: 10pt; font-weight: 700; letter-spacing: 1pt; text-transform: uppercase; color: #000; margin-bottom: 3mm; }
  .to-name { font-size: 20pt; font-weight: 800; line-height: 1.25; margin-bottom: 2mm; }
  .to-company { font-size: 11pt; font-weight: 600; color: #333; margin-bottom: 2mm; }
  .to-addr-line { font-size: 15pt; font-weight: 600; line-height: 1.45; }
  .to-pincode-row { font-size: 22pt; font-weight: 800; letter-spacing: 0.5pt; margin-top: 2.5mm; }
  .to-phone { font-size: 14pt; font-weight: 700; margin-top: 3.5mm; }

  .meta { border-top: 1.5px solid #000; padding-top: 3mm; margin-top: 5mm; }
  .order-id-row { font-size: 11pt; font-weight: 700; color: #000; margin-bottom: 2mm; }
  .meta-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 9pt; color: #555; margin-bottom: 1.5mm; }
  .meta-row strong { font-size: 9.5pt; color: #000; }

  .from-row { font-size: 7pt; color: #444; line-height: 1.4; padding-top: 2.5mm; border-top: 1px solid #000; margin-top: 5mm; }
  .from-row .from-tag { font-weight: 700; color: #000; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.5pt; margin-right: 2mm; }

  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="label">
  <div class="to-block">
    <div class="to-tag">Deliver To</div>
    <div class="to-name">${toName}</div>
    ${toCompany ? `<div class="to-company">${toCompany}</div>` : ""}
    ${toLine1 ? `<div class="to-addr-line">${toLine1}</div>` : ""}
    ${toLine2 ? `<div class="to-addr-line">${toLine2}</div>` : ""}
    ${toCityState ? `<div class="to-addr-line">${toCityState}</div>` : ""}
    ${toPincode ? `<div class="to-pincode-row">PIN ${toPincode}</div>` : ""}
    ${toPhone ? `<div class="to-phone">Ph: ${toPhone}</div>` : ""}
  </div>

  <div class="meta">
    <div class="order-id-row">Order: ${order.orderNo || order.id}</div>
    ${trackingRows}
  </div>

  <div class="from-row"><span class="from-tag">From</span>${storeName} — ${fromAddress}${fromPhone ? ` — ${fromPhone}` : ""}</div>
</div>
<script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

function printShippingLabel(order, storeProfile, trackingInfo) {
  const html = generateShippingLabelHtml(order, storeProfile, trackingInfo || {});
  const win = window.open("", "_blank", "width=580,height=760");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site to print the shipping label.");
    return;
  }
  win.document.write(html);
  win.document.close();
}

// ── Invoice + shipping label combined print (packing-stage flow) ─────────────
// Packing flow: invoice is generated while the order is still "processing"
// (before any courier is chosen), so trackingInfo is normally {} here — the
// label prints with just the delivery address, no AWB/courier yet. Staff
// pack the box with this printout, THEN pick a courier and enter tracking
// details when they press "Mark as Packed". Classes are "sl-" prefixed and
// scoped to a CSS named page (`page: sl-label-page`) instead of reusing the
// standalone label's class names, so this never collides with the invoice
// template's own <style> block, whatever it happens to use.
function buildShippingLabelBlockHtml(order, storeProfile, trackingInfo) {
  const {
    storeName, fromAddress, fromPhone, toName, toCompany, toPhone, toLine1, toLine2, toCityState, toPincode
  } = resolveLabelAddressData(order, storeProfile);

  const trackingRows = trackingInfo?.trackingId ? `
    <div class="sl-meta-row"><span>AWB</span><strong>${trackingInfo.trackingId}</strong></div>
    <div class="sl-meta-row"><span>Courier</span><strong>${trackingInfo.courierName || "—"}</strong></div>` : "";

  const style = `<style>
    @page sl-label-page { size: A6; margin: 5mm; }
    .sl-page { page: sl-label-page; page-break-before: always; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; padding: 5mm; }
    .sl-to-tag { font-size: 10pt; font-weight: 700; letter-spacing: 1pt; text-transform: uppercase; margin-bottom: 3mm; }
    .sl-to-name { font-size: 20pt; font-weight: 800; line-height: 1.25; margin-bottom: 2mm; }
    .sl-to-company { font-size: 11pt; font-weight: 600; color: #333; margin-bottom: 2mm; }
    .sl-to-addr-line { font-size: 15pt; font-weight: 600; line-height: 1.45; }
    .sl-to-pincode-row { font-size: 22pt; font-weight: 800; letter-spacing: 0.5pt; margin-top: 2.5mm; }
    .sl-to-phone { font-size: 14pt; font-weight: 700; margin-top: 3.5mm; }
    .sl-meta { border-top: 1.5px solid #000; padding-top: 3mm; margin-top: 5mm; }
    .sl-order-id-row { font-size: 11pt; font-weight: 700; margin-bottom: 2mm; }
    .sl-meta-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 9pt; color: #555; margin-bottom: 1.5mm; }
    .sl-meta-row strong { font-size: 9.5pt; color: #000; }
    .sl-from-row { font-size: 7pt; color: #444; line-height: 1.4; padding-top: 2.5mm; border-top: 1px solid #000; margin-top: 5mm; }
    .sl-from-row .sl-from-tag { font-weight: 700; color: #000; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.5pt; margin-right: 2mm; }
    @media print { .sl-page { -webkit-print-color-adjust: exact; } }
  </style>`;

  const body = `<div class="sl-page">
    <div class="sl-to-tag">Deliver To</div>
    <div class="sl-to-name">${toName}</div>
    ${toCompany ? `<div class="sl-to-company">${toCompany}</div>` : ""}
    ${toLine1 ? `<div class="sl-to-addr-line">${toLine1}</div>` : ""}
    ${toLine2 ? `<div class="sl-to-addr-line">${toLine2}</div>` : ""}
    ${toCityState ? `<div class="sl-to-addr-line">${toCityState}</div>` : ""}
    ${toPincode ? `<div class="sl-to-pincode-row">PIN ${toPincode}</div>` : ""}
    ${toPhone ? `<div class="sl-to-phone">Ph: ${toPhone}</div>` : ""}
    <div class="sl-meta">
      <div class="sl-order-id-row">Order: ${order.orderNo || order.id}</div>
      ${trackingRows}
    </div>
    <div class="sl-from-row"><span class="sl-from-tag">From</span>${storeName} — ${fromAddress}${fromPhone ? ` — ${fromPhone}` : ""}</div>
  </div>`;

  return { style, body };
}

// The invoice template itself never set an explicit @page size/margin, so
// it fell back to the browser's default print margin (~0.5in per side on
// A4). That leaves under 720px of content width — which trips the
// invoice's OWN `@media (max-width:720px)` mobile fallback (it collapses
// the 2-column Bill-To/Ship-To grid to 1 column and stacks the masthead),
// making the invoice taller and spilling onto a wasted extra page. A tight
// explicit A4 margin keeps content width safely above that 720px
// breakpoint so the invoice renders exactly as designed, on one page.
const INVOICE_PAGE_STYLE = `<style>@page { size: A4; margin: 10mm 6mm; }</style>`;

function printInvoiceWithShippingLabel(invoiceHtml, order, storeProfile, trackingInfo) {
  const { style, body } = buildShippingLabelBlockHtml(order, storeProfile, trackingInfo || {});
  const printScript = `<script>window.onload = function() { window.print(); };</script>`;
  const headStyles = `${INVOICE_PAGE_STYLE}${style}`;

  let html = invoiceHtml.includes("</head>")
    ? invoiceHtml.replace("</head>", `${headStyles}</head>`)
    : `${headStyles}${invoiceHtml}`;
  html = html.includes("</body>")
    ? html.replace("</body>", `${body}${printScript}</body>`)
    : `${html}${body}${printScript}`;

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site to print the invoice and shipping label.");
    return;
  }
  win.document.write(html);
  win.document.close();
}

// ── Status chip ───────────────────────────────────────────────────────────────

const CHIP_COLORS = {
  accepted: { bg: "rgba(22,163,74,0.1)", color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  paid: { bg: "rgba(22,163,74,0.1)", color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  fulfilled: { bg: "rgba(22,163,74,0.1)", color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  delivered: { bg: "rgba(22,163,74,0.1)", color: "#16a34a", border: "rgba(22,163,74,0.25)" },
  processing: { bg: "rgba(37,99,235,0.08)", color: "#1d4ed8", border: "rgba(37,99,235,0.25)" },
  pending: { bg: "rgba(234,179,8,0.1)", color: "#92400e", border: "rgba(234,179,8,0.35)" },
  failed: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", border: "rgba(220,38,38,0.25)" },
  rejected: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", border: "rgba(220,38,38,0.25)" },
  cancelled: { bg: "rgba(220,38,38,0.08)", color: "#dc2626", border: "rgba(220,38,38,0.25)" },
  order_placed: { bg: "rgba(14,165,233,0.08)", color: "#0369a1", border: "rgba(14,165,233,0.25)" },
  not_processed: { bg: "rgba(234,179,8,0.1)", color: "#92400e", border: "rgba(234,179,8,0.35)" },
  order_processed: { bg: "rgba(37,99,235,0.08)", color: "#1d4ed8", border: "rgba(37,99,235,0.25)" },
  invoice_generated: { bg: "rgba(37,99,235,0.08)", color: "#1d4ed8", border: "rgba(37,99,235,0.25)" },
  packed: { bg: "rgba(126,34,206,0.08)", color: "#7e22ce", border: "rgba(126,34,206,0.25)" },
  waiting_for_shipping: { bg: "rgba(126,34,206,0.08)", color: "#7e22ce", border: "rgba(126,34,206,0.25)" },
  order_shipped: { bg: "rgba(147,51,234,0.08)", color: "#7e22ce", border: "rgba(147,51,234,0.25)" },
};

function StatusChip({ label, value }) {
  const key = String(value || "").toLowerCase().replace(/\s+/g, "_");
  const style = CHIP_COLORS[key] || { bg: "rgba(100,116,139,0.08)", color: "#475569", border: "rgba(100,116,139,0.2)" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 700, color: style.color,
        background: style.bg, border: `1px solid ${style.border}`,
        borderRadius: 20, padding: "3px 10px", display: "inline-block"
      }}>
        {humanize(value)}
      </span>
    </div>
  );
}

// ── Payment Action Banner ────────────────────────────────────────────────────

const MANUAL_PAYMENT_METHODS_UI = new Set(["direct_bank_transfer", "manual_upi"]);

function PaymentActionBanner({
  order, onConfirmPayment, paymentSaving,
  onDemandPayment, demandSaving, demandNotice, demandError
}) {
  const isManual = MANUAL_PAYMENT_METHODS_UI.has(order.paymentMethod);
  const paymentVerified = order.manualPaymentStatus === "verified";

  if (!isManual || paymentVerified) return null;

  return (
    <div style={{
      background: "rgba(232,35,26,0.03)", border: "1.5px solid rgba(232,35,26,0.25)",
      borderRadius: 12, padding: "16px 20px", marginBottom: 14
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8231A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#E8231A" }}>
          Manual Payment — Admin Action Required
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>
          ({humanize(order.paymentMethod)})
        </span>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        Verify that the bank transfer / UPI payment has been received in your account before processing this order.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button" className="btn btn-primary btn-small"
          disabled={paymentSaving}
          onClick={onConfirmPayment}
          style={{ background: "#d97706" }}
        >
          {paymentSaving ? "Confirming…" : "Confirm Payment Received"}
        </button>
        <button
          type="button" className="btn btn-secondary btn-small"
          disabled={demandSaving}
          onClick={onDemandPayment}
        >
          {demandSaving ? "Sending…" : "Demand for Payment"}
        </button>
      </div>
      {demandNotice ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{demandNotice}</p>
      ) : null}
      {demandError ? (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>{demandError}</p>
      ) : null}
      <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--muted)" }}>
        "Demand for Payment" sends the customer a WhatsApp message with the amount due, a
        prefilled UPI pay link, and their order page to upload a payment screenshot. "Confirm
        Payment Received" is a manual override — use it only if you've verified the transfer
        another way (e.g. bank statement) without an in-app screenshot.
      </p>
    </div>
  );
}

// ── Manual payment proof review ───────────────────────────────────────────────

function ManualPaymentSection({ order, submissions, onVerify, onReject, busyKey }) {
  const isManual = MANUAL_PAYMENT_METHODS_UI.has(order.paymentMethod);
  if (!isManual || submissions.length === 0) return null;

  return (
    <div style={{
      background: "rgba(232,35,26,0.03)", border: "1.5px solid rgba(232,35,26,0.25)",
      borderRadius: 12, padding: "16px 20px", marginBottom: 14
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8231A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#E8231A" }}>Manual Payment Proof</span>
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>({humanize(order.paymentMethod)})</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {submissions.map((submission) => (
          <div key={submission.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>UTR / Ref: {submission.utrNumber || "—"}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Submitted {formatDateTime(submission.submittedAt)}</div>
              </div>
              <StatusChip label="Proof Status" value={submission.status} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {submission.screenshotUrl ? (
                <a className="btn btn-secondary btn-small" href={submission.screenshotUrl} target="_blank" rel="noreferrer">Open Proof</a>
              ) : (
                <span style={{ fontSize: 12, color: "var(--danger)" }}>No screenshot uploaded</span>
              )}
              {submission.status === "pending_verification" && (
                <>
                  <button type="button" className="btn btn-primary btn-small"
                    disabled={busyKey === `verify:${submission.id}`}
                    onClick={() => onVerify(submission.id)}>
                    {busyKey === `verify:${submission.id}` ? "Verifying…" : "Verify Payment"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-small"
                    disabled={busyKey === `reject:${submission.id}`}
                    onClick={() => onReject(submission.id)}>
                    {busyKey === `reject:${submission.id}` ? "Rejecting…" : "Reject"}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mark as Processing modal ─────────────────────────────────────────────────

function ProcessingModal({ order, onClose, onSave, saving, error }) {
  const [items, setItems] = useState(() =>
    (order.items || []).map((item, i) => ({
      srNo: i + 1,
      productId: item.productId,
      title: item.title,
      fulfillQty: item.qty
    }))
  );
  const [note, setNote] = useState(order.adminNote || "");

  const updateItem = (idx, key, val) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));

  return (
    <Modal title="Mark as Processing" open onClose={onClose} width="620px" disableOutsideClick>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          Review items below. Adjust fulfill quantity if dispatching a partial shipment due to stock shortage.
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "var(--muted)", width: 50 }}>Sr#</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Product</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)", width: 80 }}>Ordered</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)", width: 100 }}>Fulfill Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "10px 12px", color: "var(--muted)", fontWeight: 600 }}>
                    <input
                      type="number" min="1" value={item.srNo}
                      onChange={(e) => updateItem(idx, "srNo", Number(e.target.value))}
                      style={{ width: 40, padding: "4px 6px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 5, textAlign: "center" }}
                    />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>ID: {item.productId}</div>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--muted)" }}>
                    {(order.items || []).find((o) => o.productId === item.productId)?.qty ?? "—"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <input
                      type="number" min="0" value={item.fulfillQty}
                      onChange={(e) => updateItem(idx, "fulfillQty", Number(e.target.value))}
                      style={{ width: 70, padding: "5px 8px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 5, textAlign: "center" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Admin Note (internal)</span>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)}
            rows={2} placeholder="Internal notes about this processing step..."
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button" className="btn btn-primary" disabled={saving}
            onClick={() => onSave({ fulfillmentItems: items, adminNote: note })}
          >
            {saving ? "Saving…" : "Mark as Processing"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit Items modal ──────────────────────────────────────────────────────────

function EditItemsModal({ order, onClose, onSave, saving, error }) {
  const [items, setItems] = useState(() =>
    (order.items || []).map((item) => ({
      productId: item.productId,
      title: item.title,
      sku: item.sku,
      qty: item.qty
    }))
  );
  const [discountAmount, setDiscountAmount] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const updateQty = (productId, qty) =>
    setItems((prev) => prev.map((it) => it.productId === productId ? { ...it, qty: Math.max(1, Number(qty) || 1) } : it));

  const removeItem = (productId) =>
    setItems((prev) => prev.filter((it) => it.productId !== productId));

  const addProduct = (product) => {
    setItems((prev) => {
      if (prev.some((it) => it.productId === product.id)) {
        return prev.map((it) => it.productId === product.id ? { ...it, qty: it.qty + 1 } : it);
      }
      return [...prev, { productId: product.id, title: product.title, sku: product.sku, qty: 1 }];
    });
    setQuery("");
    setResults([]);
  };

  const runSearch = async (q) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const rows = await searchWalkInProducts({ q: q.trim(), limit: 8 });
      setResults(Array.isArray(rows) ? rows : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal title="Edit Order Items" open onClose={onClose} width="620px" disableOutsideClick>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          Only available before payment is confirmed. Prices, GST, and shipping are
          recalculated from current catalogue values — this does not simply relabel
          the old total.
        </p>

        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Product</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)", width: 90 }}>Qty</th>
                <th style={{ padding: "8px 12px", width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={3} style={{ padding: 14, textAlign: "center", color: "var(--muted)" }}>No items — add a product below.</td></tr>
              )}
              {items.map((item) => (
                <tr key={item.productId} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    {item.sku && <div style={{ fontSize: 11, color: "var(--muted)" }}>SKU: {item.sku}</div>}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <input
                      type="number" min="1" value={item.qty}
                      onChange={(e) => updateQty(item.productId, e.target.value)}
                      style={{ width: 60, padding: "5px 8px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 5, textAlign: "center" }}
                    />
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <button type="button" onClick={() => removeItem(item.productId)}
                      style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                      title="Remove item">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ position: "relative" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Add Product</span>
            <input
              type="text" value={query} placeholder="Search by name, SKU, HSN..."
              onChange={(e) => runSearch(e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
            />
          </label>
          {(searching || results.length > 0) && query && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, marginTop: 4,
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 220, overflowY: "auto"
            }}>
              {searching && <div style={{ padding: 10, fontSize: 12, color: "var(--muted)" }}>Searching…</div>}
              {!searching && results.length === 0 && (
                <div style={{ padding: 10, fontSize: 12, color: "var(--muted)" }}>No matching products.</div>
              )}
              {results.map((product) => (
                <button
                  key={product.id} type="button" onClick={() => addProduct(product)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                    background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 13
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{product.title}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    SKU: {product.sku} · {formatCurrencyInr(product.salePrice || product.basePrice || 0)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 5, maxWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Additional Discount (₹)</span>
          <input
            type="number" min="0" value={discountAmount}
            onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
          />
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            On top of any automatic payment-method discount. Not a %.
          </span>
        </label>

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button" className="btn btn-primary"
            disabled={saving || items.length === 0}
            onClick={() => onSave({
              items: items.map((it) => ({ productId: it.productId, qty: it.qty })),
              discountAmount
            })}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Convert to Fulfill modal ──────────────────────────────────────────────────

function FulfillModal({ order, invoice, couriers, onClose, onSave, saving, error }) {
  const [form, setForm] = useState({
    courierProfileId: "",
    trackingId: "",
    dispatchDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: "",
    customerNote: order.customerNote || "",
    podFile: null
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const customerMobile = order.billingAddress?.mobile || order.shippingAddress?.mobile || order.customerMobile || "";

  return (
    <Modal title="Mark as Packed" open onClose={onClose} width="580px" disableOutsideClick>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 8, padding: "10px 14px" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#1d4ed8", fontWeight: 500 }}>
            Invoice #{invoice?.invoiceNumber} · {order.itemCount} item(s) · {formatCurrencyInr(order.orderTotal)}
          </p>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Courier Partner</span>
          <select value={form.courierProfileId} onChange={(e) => set("courierProfileId", e.target.value)}
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)" }}>
            <option value="">Select courier...</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>{c.courierName}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Tracking Number / AWB</span>
          <input value={form.trackingId} onChange={(e) => set("trackingId", e.target.value)}
            placeholder="Enter tracking / AWB number"
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Dispatch Date</span>
            <input type="date" value={form.dispatchDate} onChange={(e) => set("dispatchDate", e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Expected Delivery</span>
            <input type="date" value={form.expectedDeliveryDate} onChange={(e) => set("expectedDeliveryDate", e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
          </label>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            Customer Note <span style={{ fontWeight: 400, color: "var(--muted)" }}>(sent via WhatsApp & email)</span>
          </span>
          <textarea value={form.customerNote} onChange={(e) => set("customerNote", e.target.value)}
            rows={2} placeholder="Message to send to customer with dispatch notification..."
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            Package Image <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span>
          </span>
          <input type="file" accept="image/*,application/pdf"
            onChange={(e) => set("podFile", e.target.files?.[0] || null)}
            style={{ fontSize: 13 }} />
        </label>

        {customerMobile && form.trackingId && (
          <div style={{ background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.3)", borderRadius: 8, padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#166534" }}>
              This just records the tracking details for packing — {order.customerName} ({customerMobile})
              won't be notified until you mark the order as actually shipped.
            </p>
          </div>
        )}

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button" className="btn btn-primary" disabled={saving || !form.trackingId}
            onClick={() => onSave(form)}
          >
            {saving ? "Saving…" : "Mark as Packed"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Mark Delivered modal ──────────────────────────────────────────────────────

function DeliveryConfirmModal({ onClose, onSave, saving, error }) {
  const [confirmed, setConfirmed] = useState(false);
  const [deliveredAt, setDeliveredAt] = useState(new Date().toISOString().slice(0, 10));

  return (
    <Modal title="Mark Order as Delivered" open onClose={onClose} width="440px" disableOutsideClick>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox" checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={{ fontSize: 13, color: "var(--text)" }}>
            I confirm this order has been delivered to the customer.
          </span>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Date of Delivery</span>
          <input
            type="date" value={deliveredAt}
            onChange={(e) => setDeliveredAt(e.target.value)}
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
          />
        </label>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button" className="btn btn-primary" style={{ background: "#16a34a" }}
            disabled={saving || !confirmed}
            onClick={() => onSave({ deliveredAt })}
          >
            {saving ? "Saving…" : "Mark as Delivered"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit Tracking modal (re-ship with a different courier, etc.) ─────────────

function EditTrackingModal({ trackingDetails, couriers, onClose, onSave, saving, error }) {
  const matchedCourier = couriers.find(
    (c) => c.courierCode === trackingDetails.courierCode || c.courierName === trackingDetails.courierName
  );
  const [form, setForm] = useState({
    courierProfileId: matchedCourier?.id || "",
    trackingId: trackingDetails.trackingId || "",
    dispatchDate: trackingDetails.dispatchDate || new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: trackingDetails.expectedDeliveryDate || ""
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const wasReturned = ["returned", "delivery_failed", "cancelled"].includes(trackingDetails.shipmentStatus);

  return (
    <Modal title="Edit Shipment Tracking" open onClose={onClose} width="480px" disableOutsideClick>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {wasReturned && (
          <div style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, padding: "10px 14px" }}>
            <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
              This shipment is currently marked <strong>{humanize(trackingDetails.shipmentStatus)}</strong>. Saving new
              tracking details here will re-mark it as Shipped for the new courier attempt.
            </p>
          </div>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Courier Partner</span>
          <select value={form.courierProfileId} onChange={(e) => set("courierProfileId", e.target.value)}
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface)" }}>
            <option value="">Select courier...</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>{c.courierName}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Tracking Number / AWB</span>
          <input value={form.trackingId} onChange={(e) => set("trackingId", e.target.value)}
            placeholder="Enter tracking / AWB number"
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Dispatch Date</span>
            <input type="date" value={form.dispatchDate} onChange={(e) => set("dispatchDate", e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Expected Delivery</span>
            <input type="date" value={form.expectedDeliveryDate} onChange={(e) => set("expectedDeliveryDate", e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }} />
          </label>
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button" className="btn btn-primary" disabled={saving || !form.trackingId || !form.courierProfileId}
            onClick={() => onSave(form)}
          >
            {saving ? "Saving…" : "Save Tracking Details"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Notes editor ─────────────────────────────────────────────────────────────

function NotesEditor({ order, onSave, saving }) {
  const [adminNote, setAdminNote] = useState(order.adminNote || "");
  const [customerNote, setCustomerNote] = useState(order.customerNote || "");
  const [dirty, setDirty] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Admin Note (internal)</span>
        <textarea
          value={adminNote}
          onChange={(e) => { setAdminNote(e.target.value); setDirty(true); }}
          rows={3} placeholder="Internal note — not visible to customer..."
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Customer Note (sent with dispatch)</span>
        <textarea
          value={customerNote}
          onChange={(e) => { setCustomerNote(e.target.value); setDirty(true); }}
          rows={3} placeholder="Message sent to customer via WhatsApp & email on dispatch..."
          style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>
      {dirty && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary btn-small" disabled={saving}
            onClick={() => { onSave({ adminNote, customerNote }); setDirty(false); }}>
            {saving ? "Saving…" : "Save Notes"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tags editor ───────────────────────────────────────────────────────────────

function TagsEditor({ tags, onSave, saving }) {
  const [input, setInput] = useState("");
  const [localTags, setLocalTags] = useState(tags || []);

  const addTag = () => {
    const tag = input.trim().toLowerCase();
    if (tag && !localTags.includes(tag)) {
      const next = [...localTags, tag];
      setLocalTags(next);
      onSave({ tags: next });
    }
    setInput("");
  };

  const removeTag = (t) => {
    const next = localTags.filter((x) => x !== t);
    setLocalTags(next);
    onSave({ tags: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {localTags.map((tag) => (
          <span key={tag} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)",
            borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, color: "#1d4ed8"
          }}>
            {tag}
            <button type="button" onClick={() => removeTag(tag)} disabled={saving}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#1d4ed8", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        {localTags.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>No tags yet</span>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Type tag and press Add..."
          onKeyDown={(e) => e.key === "Enter" && addTag()}
          style={{ flex: 1, padding: "6px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
        />
        <button type="button" className="btn btn-secondary btn-small" onClick={addTag} disabled={saving || !input.trim()}>
          Add Tag
        </button>
      </div>
    </div>
  );
}

// ── Invoice section ───────────────────────────────────────────────────────────

const BUYER_DETAIL_FIELDS = [
  ["Company Name", "companyName"],
  ["Contact Name", "name"],
  ["GSTIN", "gstin"],
  ["Email", "email"],
  ["Mobile", "mobile"],
  ["Address Line 1", "addressLine1"],
  ["Address Line 2", "addressLine2"],
  ["City", "city"],
  ["Pincode", "pincode"]
];

function EditBuyerDetailsModal({ invoice, onClose, onSave, saving, error }) {
  const buyer = invoice.buyer || {};
  const [form, setForm] = useState(() => {
    const init = { reason: "" };
    for (const [, key] of BUYER_DETAIL_FIELDS) init[key] = buyer[key] || "";
    return init;
  });
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <Modal title="Edit Buyer Details" open onClose={onClose} width="560px" disableOutsideClick>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
          Corrects the buyer's name/company/GSTIN/contact/address on this invoice — same invoice
          number, doesn't touch tax already charged. State can't be changed here since it drives
          Place of Supply; a state correction needs a credit note instead.
        </p>
        {BUYER_DETAIL_FIELDS.map(([label, key]) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{label}</span>
            <input
              type="text" value={form[key]}
              onChange={(e) => set(key, e.target.value)}
              style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
            />
          </label>
        ))}
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Reason (internal note, optional)</span>
          <input
            type="text" value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
            placeholder="e.g. Buyer provided GSTIN after order was placed"
            style={{ padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)", borderRadius: 7 }}
          />
        </label>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>
            {saving ? "Saving…" : "Save Correction"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function InvoiceSection({ invoice, onInvoiceUpdated, order, storeProfile }) {
  const [err, setErr] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [printingLabelSet, setPrintingLabelSet] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const handleSaveBuyerEdit = async (form) => {
    setEditSaving(true);
    setEditError("");
    try {
      const updated = await correctInvoiceBuyer(invoice.id, form);
      onInvoiceUpdated?.(updated);
      setEditModal(false);
    } catch (e) {
      setEditError(e.message || "Failed to save correction.");
    } finally {
      setEditSaving(false);
    }
  };

  const download = async () => {
    if (!invoice?.id) return;
    setDownloading(true);
    try {
      const data = await fetchInvoiceDownloadData(invoice.id);
      const content = data?.content || JSON.stringify(data, null, 2);
      const blob = new Blob([content], { type: data?.contentType || "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data?.fileName || `invoice-${invoice.invoiceNumber}.html`;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message || "Failed to download.");
    } finally {
      setDownloading(false);
    }
  };

  const printWithLabel = async () => {
    if (!invoice?.id) return;
    setPrintingLabelSet(true);
    setErr("");
    try {
      const data = await fetchInvoiceDownloadData(invoice.id);
      const content = data?.content || "";
      printInvoiceWithShippingLabel(content, order, storeProfile, order?.trackingDetails || {});
    } catch (e) {
      setErr(e.message || "Failed to prepare invoice + label.");
    } finally {
      setPrintingLabelSet(false);
    }
  };

  if (invoice) {
    return (
      <div style={{ background: "rgba(22,163,74,0.04)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Invoice #{invoice.invoiceNumber}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{formatDateTime(invoice.invoiceDate || invoice.createdAt)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => { setEditModal(true); setEditError(""); }}>
              Edit Buyer Details
            </button>
            <button type="button" className="btn btn-secondary btn-small" disabled={downloading} onClick={download}>
              {downloading ? "Preparing…" : "Download PDF"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" disabled={printingLabelSet} onClick={printWithLabel}>
              {printingLabelSet ? "Preparing…" : "Print Invoice + Shipping Label"}
            </button>
          </div>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--muted)" }}>
          Prints as a 2-page job — invoice, then the shipping label (address only, no courier
          yet) — so the order can be packed and labelled before you enter courier details on
          "Mark as Packed".
        </p>
        {err && <p style={{ color: "var(--danger)", fontSize: 12, margin: "8px 0 0" }}>{err}</p>}
        {editModal && (
          <EditBuyerDetailsModal
            invoice={invoice}
            onClose={() => setEditModal(false)}
            onSave={handleSaveBuyerEdit}
            saving={editSaving}
            error={editError}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "rgba(234,179,8,0.04)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 8, padding: "12px 14px" }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
        No invoice generated yet — use the action button below to generate it.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const canView = hasPermission(session, "orders.view");
  const canViewProducts = hasPermission(session, "products.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [productLookup, setProductLookup] = useState({});
  const [invoice, setInvoice] = useState(null);
  const [couriers, setCouriers] = useState([]);
  const [storeProfile, setStoreProfile] = useState({});
  const [resendingTracking, setResendingTracking] = useState(false);

  const [processingModal, setProcessingModal] = useState(false);
  const [processingError, setProcessingError] = useState("");
  const [processingSaving, setProcessingSaving] = useState(false);

  const [editItemsModal, setEditItemsModal] = useState(false);
  const [editItemsError, setEditItemsError] = useState("");
  const [editItemsSaving, setEditItemsSaving] = useState(false);

  const [fulfillModal, setFulfillModal] = useState(false);
  const [fulfillError, setFulfillError] = useState("");
  const [fulfillSaving, setFulfillSaving] = useState(false);
  const [printingLabel, setPrintingLabel] = useState(false);
  const [markingShipped, setMarkingShipped] = useState(false);

  const [deliveryModal, setDeliveryModal] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliverySaving, setDeliverySaving] = useState(false);

  const [invoiceGenerating, setInvoiceGenerating] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");

  const [editTrackingModal, setEditTrackingModal] = useState(false);
  const [editTrackingError, setEditTrackingError] = useState("");
  const [editTrackingSaving, setEditTrackingSaving] = useState(false);

  const [noteSaving, setNoteSaving] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [paymentConfirmSaving, setPaymentConfirmSaving] = useState(false);
  const [paymentDemandSaving, setPaymentDemandSaving] = useState(false);
  const [paymentDemandNotice, setPaymentDemandNotice] = useState("");
  const [paymentDemandError, setPaymentDemandError] = useState("");

  const [manualPayments, setManualPayments] = useState([]);
  const [manualPaymentBusyKey, setManualPaymentBusyKey] = useState("");

  const reload = async () => {
    setError("");
    try {
      const [ord, inv, mp] = await Promise.allSettled([
        fetchOrderDetail(orderId),
        fetchInvoiceForOrder(orderId),
        fetchManualPaymentsForOrder(orderId)
      ]);
      if (ord.status === "fulfilled") setOrder(ord.value);
      else setError(ord.reason?.message || "Failed to load order.");
      if (inv.status === "fulfilled" && inv.value?.invoiceNumber) setInvoice(inv.value);
      if (mp.status === "fulfilled") setManualPayments(Array.isArray(mp.value) ? mp.value : []);
    } catch (e) {
      setError(e.message || "Failed to load.");
    }
  };

  useEffect(() => {
    if (!canView) return;
    const init = async () => {
      setLoading(true);
      await reload();
      try {
        const cs = await fetchShippingCouriers();
        setCouriers(Array.isArray(cs) ? cs : []);
      } catch {
        setCouriers([]);
      }
      try {
        const settings = await fetchSettings();
        setStoreProfile(settings?.storeProfile || {});
      } catch {
        // non-fatal — label will show empty from address
      }
      setLoading(false);
    };
    init();
  }, [orderId]);

  // Order items only snapshot title/sku/price at purchase time, so the
  // current product (for its image + a live View/Edit link) is fetched
  // separately, once per unique productId on the order.
  useEffect(() => {
    if (!canViewProducts) return;
    const productIds = [...new Set((order?.items || []).map((item) => item.productId).filter(Boolean))];
    const missingIds = productIds.filter((id) => !(id in productLookup));
    if (missingIds.length === 0) return;

    let cancelled = false;
    Promise.allSettled(missingIds.map((id) => fetchProduct(id))).then((results) => {
      if (cancelled) return;
      setProductLookup((prev) => {
        const next = { ...prev };
        results.forEach((result, i) => {
          next[missingIds[i]] = result.status === "fulfilled" ? result.value : null;
        });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [order, canViewProducts]);

  const handleUpdateOrder = async (patch) => {
    const updated = await updateOrder(orderId, patch);
    setOrder(updated);
  };

  const handleMarkProcessing = async (data) => {
    setProcessingSaving(true);
    setProcessingError("");
    try {
      await handleUpdateOrder({ ...data, orderStatus: "processing" });
      setProcessingModal(false);
    } catch (e) {
      setProcessingError(e.message || "Failed to mark as processing.");
    } finally {
      setProcessingSaving(false);
    }
  };

  const handleEditItems = async (payload) => {
    setEditItemsSaving(true);
    setEditItemsError("");
    try {
      const updated = await editOrderItems(orderId, payload);
      setOrder(updated);
      setEditItemsModal(false);
    } catch (e) {
      setEditItemsError(e.message || "Failed to update order items.");
    } finally {
      setEditItemsSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    setCancelSaving(true);
    try {
      await handleUpdateOrder({ orderStatus: "cancelled" });
    } catch (e) {
      setError(e.message || "Failed to cancel.");
    } finally {
      setCancelSaving(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!window.confirm("Mark this payment as received / verified? This will update payment status to Paid.")) return;
    setPaymentConfirmSaving(true);
    try {
      await handleUpdateOrder({ manualPaymentStatus: "verified" });
    } catch (e) {
      setError(e.message || "Failed to confirm payment.");
    } finally {
      setPaymentConfirmSaving(false);
    }
  };

  const handleDemandPayment = async () => {
    setPaymentDemandSaving(true);
    setPaymentDemandNotice("");
    setPaymentDemandError("");
    try {
      const result = await demandManualPayment(orderId);
      setPaymentDemandNotice(`Payment demand sent via WhatsApp to ${result.sentTo || "the customer"}.`);
    } catch (e) {
      setPaymentDemandError(e.message || "Failed to send payment demand.");
    } finally {
      setPaymentDemandSaving(false);
    }
  };

  const handleVerifyManualPayment = async (submissionId) => {
    setManualPaymentBusyKey(`verify:${submissionId}`);
    setError("");
    try {
      await verifyManualPayment(submissionId, { action: "approve", verificationNote: "Payment matched with bank proof." });
      await reload();
    } catch (e) {
      setError(e.message || "Failed to verify manual payment.");
    } finally {
      setManualPaymentBusyKey("");
    }
  };

  const handleRejectManualPayment = async (submissionId) => {
    const rejectionReason = window.prompt("Enter rejection reason for this payment proof:", "proof_not_clear");
    if (!rejectionReason) return;
    setManualPaymentBusyKey(`reject:${submissionId}`);
    setError("");
    try {
      await verifyManualPayment(submissionId, { action: "reject", rejectionReason, verificationNote: rejectionReason });
      await reload();
    } catch (e) {
      setError(e.message || "Failed to reject manual payment.");
    } finally {
      setManualPaymentBusyKey("");
    }
  };

  const handleGenerateInvoice = async () => {
    setInvoiceGenerating(true);
    setInvoiceError("");
    try {
      const result = await generateInvoiceForOrder(orderId, { invoiceDate: new Date().toISOString().slice(0, 10) });
      setInvoice(result?.invoice || result);
    } catch (e) {
      setInvoiceError(e.message || "Failed to generate invoice.");
    } finally {
      setInvoiceGenerating(false);
    }
  };

  const handleMarkDelivered = async ({ deliveredAt }) => {
    const shipmentId = order?.trackingDetails?.shipmentId;
    if (!shipmentId) {
      setDeliveryError("No shipment found for this order.");
      return;
    }
    setDeliverySaving(true);
    setDeliveryError("");
    try {
      await updateShipmentStatus(shipmentId, { shipmentStatus: "delivered", deliveredAt });
      setDeliveryModal(false);
      await reload();
    } catch (e) {
      setDeliveryError(e.message || "Failed to mark as delivered.");
    } finally {
      setDeliverySaving(false);
    }
  };

  const handleEditTracking = async (form) => {
    const shipmentId = order?.trackingDetails?.shipmentId;
    if (!shipmentId) {
      setEditTrackingError("No shipment found for this order.");
      return;
    }
    setEditTrackingSaving(true);
    setEditTrackingError("");
    try {
      await updateShipmentTracking(shipmentId, form);
      // A shipment that came back (returned / delivery failed / cancelled) needs to be
      // re-marked Shipped for the new courier attempt — updateShipmentTracking only
      // auto-advances pre-dispatch statuses, so push it forward explicitly here.
      const wasReturned = ["returned", "delivery_failed", "cancelled"].includes(
        order.trackingDetails.shipmentStatus
      );
      if (wasReturned) {
        await updateShipmentStatus(shipmentId, { shipmentStatus: "shipped" });
      }
      setEditTrackingModal(false);
      await reload();
    } catch (e) {
      setEditTrackingError(e.message || "Failed to update tracking details.");
    } finally {
      setEditTrackingSaving(false);
    }
  };

  const handleNoteSave = async (patch) => {
    setNoteSaving(true);
    try {
      await handleUpdateOrder(patch);
    } catch (e) {
      setError(e.message || "Failed to save notes.");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleResendTracking = async () => {
    const td = order?.trackingDetails;
    if (!td?.trackingId) return;
    const phone = order.billingAddress?.mobile || order.shippingAddress?.mobile || order.customerMobile || "";
    if (phone) {
      const waMsg = [
        `Hi ${order.customerName || "there"}, here are your order #${order.orderNo} shipment details:`,
        `Courier: ${td.courierName || ""}`,
        `Tracking ID: ${td.trackingId}`,
        td.expectedDeliveryDate ? `Expected Delivery: ${td.expectedDeliveryDate}` : "",
        td.trackingUrl ? `Track here: ${td.trackingUrl}` : ""
      ].filter(Boolean).join("\n");
      const waLink = buildWaLink(phone, waMsg);
      if (waLink) window.open(waLink, "_blank");
    }
    if (td.shipmentId) {
      setResendingTracking(true);
      try { await sendTrackingEmail(td.shipmentId, {}); } catch { /* non-fatal */ }
      finally { setResendingTracking(false); }
    }
  };

  // Records courier + tracking and stops at "packed" — it does NOT jump straight
  // to shipped/fulfilled anymore. The customer isn't told "shipped" until the
  // separate Mark as Shipped action after the package actually leaves.
  const handleFulfill = async (form) => {
    setFulfillSaving(true);
    setFulfillError("");
    try {
      // 1. Create shipment
      const { shipment } = await createShipment({
        orderId: order.id,
        courierProfileId: form.courierProfileId || undefined,
        packageCount: 1,
        adminNotes: form.customerNote
      });

      // 2. Record courier + tracking, target status: packed
      if (form.trackingId && form.courierProfileId) {
        await updateShipmentTracking(shipment.id, {
          courierProfileId: form.courierProfileId,
          trackingId: form.trackingId,
          dispatchDate: form.dispatchDate,
          expectedDeliveryDate: form.expectedDeliveryDate,
          targetStatus: "packed"
        });
      }

      // 3. Upload package image if provided
      if (form.podFile) {
        try { await uploadShipmentPod(shipment.id, form.podFile); } catch { /* non-fatal */ }
      }

      // 4. Save customer note (order stays "processing" until actually shipped)
      if (form.customerNote) {
        await handleUpdateOrder({ customerNote: form.customerNote });
      }

      setFulfillModal(false);
      await reload();
    } catch (e) {
      setFulfillError(e.message || "Failed to mark order as packed.");
    } finally {
      setFulfillSaving(false);
    }
  };

  const handlePrintShippingLabel = async () => {
    const shipmentId = order?.trackingDetails?.shipmentId;
    if (!shipmentId) return;
    printShippingLabel(order, storeProfile, order.trackingDetails);
    setPrintingLabel(true);
    setError("");
    try {
      await updateShipmentStatus(shipmentId, { shipmentStatus: "ready_to_dispatch" });
      await reload();
    } catch (e) {
      setError(e.message || "Failed to update shipment status.");
    } finally {
      setPrintingLabel(false);
    }
  };

  const handleMarkShipped = async () => {
    const shipmentId = order?.trackingDetails?.shipmentId;
    if (!shipmentId) return;
    setMarkingShipped(true);
    setError("");
    try {
      await updateShipmentStatus(shipmentId, { shipmentStatus: "shipped" });
      await reload();
    } catch (e) {
      setError(e.message || "Failed to mark order as shipped.");
    } finally {
      setMarkingShipped(false);
    }
  };

  // ── Render ──

  if (!canView) return <ErrorBlock message="You do not have permission to view orders." />;
  if (loading) return <LoadingBlock label="Loading order..." />;
  if (error && !order) return <ErrorBlock message={error} onRetry={reload} />;
  if (!order) return <ErrorBlock message="Order not found." />;

  // Single controlled pipeline: New -> Processing -> Invoice Generated -> Packed ->
  // Waiting for Shipping -> Shipped -> Delivered. Cancel is only available before
  // processing starts — once an order enters this pipeline it can no longer be
  // cancelled by mistake, only carried through to delivery.
  const shipmentStatus = order.shipmentStatus || "";
  const orderStage =
    order.orderStatus === "cancelled" ? "cancelled" :
    order.orderStatus === "delivered" ? "delivered" :
    ["shipped", "in_transit", "out_for_delivery"].includes(shipmentStatus) ? "shipped" :
    shipmentStatus === "ready_to_dispatch" ? "waiting_for_shipping" :
    shipmentStatus === "packed" ? "packed" :
    (order.orderStatus === "processing" && invoice) ? "ready_to_ship" :
    order.orderStatus === "processing" ? "ready_for_invoice" :
    "new";
  const canCancel = orderStage === "new";
  // Mirrors the backend eligibility check in orders.service.js editOrderItems —
  // kept here too so the button doesn't even appear when it would just 409.
  const canEditItems =
    order.paymentStatus !== "paid" &&
    !["cancelled", "fulfilled"].includes(order.orderStatus) &&
    EDITABLE_PAYMENT_METHODS.has(order.paymentMethod) &&
    !invoice;
  const orderStageValue = {
    new: "not_processed",
    ready_for_invoice: "order_processed",
    ready_to_ship: "invoice_generated",
    packed: "packed",
    waiting_for_shipping: "waiting_for_shipping",
    shipped: "order_shipped",
    delivered: "delivered",
    cancelled: "cancelled"
  }[orderStage];
  const customerPhone = order.billingAddress?.mobile || order.shippingAddress?.mobile || order.customerMobile || "";

  return (
    <div className="order-detail-shell" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Breadcrumb + back */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          <span style={{ cursor: "pointer", color: "var(--brand)" }} onClick={() => navigate("/orders")}>Orders</span>
          <span style={{ margin: "0 6px" }}>›</span>
          <span>View Order</span>
        </div>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => navigate("/orders")}>
          ← Go Back
        </button>
      </div>

      {/* Title */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 16px" }}>
        View Order (# {order.orderNo || order.id})
      </h1>

      {/* Status chips */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <StatusChip label="Order Status" value={order.orderStatus} />
          <StatusChip label="Fulfillment Stage" value={orderStageValue} />
          <StatusChip label="Acceptance Status" value={order.acceptanceStatus} />
          <StatusChip label="Payment Mode" value={order.paymentMethod} />
          <StatusChip label="Payment Status" value={order.paymentStatus} />
        </div>
      </div>

      {/* Manual payment action banner */}
      <ManualPaymentSection
        order={order}
        submissions={manualPayments}
        onVerify={handleVerifyManualPayment}
        onReject={handleRejectManualPayment}
        busyKey={manualPaymentBusyKey}
      />
      {manualPayments.length === 0 && (
        <PaymentActionBanner
          order={order}
          onConfirmPayment={handleConfirmPayment}
          paymentSaving={paymentConfirmSaving}
          onDemandPayment={handleDemandPayment}
          demandSaving={paymentDemandSaving}
          demandNotice={paymentDemandNotice}
          demandError={paymentDemandError}
        />
      )}

      {/* Payment gateway info */}
      {order.gatewayTxnId && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 18px", marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
          <span><strong style={{ color: "var(--text)" }}>Payment Gateway:</strong> {humanize(order.paymentMethod)}</span>
          <span><strong style={{ color: "var(--text)" }}>Payment ID:</strong> {order.gatewayTxnId}</span>
          {order.checkoutSessionId && <span><strong style={{ color: "var(--text)" }}>Order ID:</strong> {order.checkoutSessionId}</span>}
        </div>
      )}

      {/* Customer / Billing / Shipping */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Customer Details</h4>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{order.customerName}</div>
          {order.customerEmail && <div style={{ fontSize: 12, color: "var(--muted)" }}>{order.customerEmail}</div>}
          {customerPhone && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{customerPhone}</span>
              {customerPhone && (
                <a href={buildWaLink(customerPhone, `Hi ${order.customerName || "there"}, this is regarding your order #${order.orderNo}.`)}
                  target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#25d366", textDecoration: "none" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a10 10 0 00-8.7 15l-1.2 5 5.1-1.3A10 10 0 1012 2zm5.1 13.4c-.2.6-1.2 1.2-1.7 1.3-.5.1-1.1.2-3.1-.6-2.4-1-4-3.5-4.1-3.7-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.5.5-.2.2-.3.4-.1.7.2.3 1 1.7 2.4 2.7 1.8 1.3 3.3 1.7 3.7 1.9.4.2.7.1.9-.1.3-.3 1-.9 1.2-1.2.2-.3.4-.3.7-.2l1.8.9c.3.2.5.3.6.5.1.2.1.9-.1 1.4z" />
                  </svg>
                  WA
                </a>
              )}
            </div>
          )}
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Billing Address</h4>
          <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>{formatAddress(order.billingAddress)}</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Shipping Address</h4>
          <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>{formatAddress(order.shippingAddress)}</div>
        </div>
      </div>

      {/* Products + Summary */}
      <div className="order-detail-content-grid" style={{ display: "grid", gap: 14, marginBottom: 14 }}>
        {/* Products table */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          {canEditItems && (
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px 0" }}>
              <button
                type="button" className="btn btn-secondary btn-small"
                onClick={() => { setEditItemsModal(true); setEditItemsError(""); }}
              >
                Edit Items
              </button>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Product</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Price</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Tax Rate</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Qty</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 11, color: "var(--muted)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((item, i) => {
                const lookedUpProduct = productLookup[item.productId];
                const imageUrl = resolveOrderItemImageUrl(lookedUpProduct?.images?.[0]);
                return (
                <tr key={i} style={{ borderBottom: i < order.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      {imageUrl ? (
                        <img
                          src={imageUrl} alt=""
                          style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{
                          width: 44, height: 44, borderRadius: 6, background: "#f3f4f6",
                          border: "1px solid var(--border)", display: "flex", alignItems: "center",
                          justifyContent: "center", flexShrink: 0, color: "#d1d5db", fontSize: 16
                        }}>&#128247;</div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                        {item.sku && <div style={{ fontSize: 11, color: "var(--muted)" }}>SKU: {item.sku}</div>}
                        {item.hsnCode && <div style={{ fontSize: 11, color: "var(--muted)" }}>HSN: {item.hsnCode}</div>}
                        {canViewProducts && item.productId && (
                          lookedUpProduct === null ? (
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Product no longer available</div>
                          ) : (
                            <button
                              type="button"
                              className="btn-link"
                              style={{ fontSize: 11, marginTop: 3, padding: 0 }}
                              onClick={() => navigate(`/products/${item.productId}/edit`)}
                            >
                              View / Edit Product
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatCurrencyInr(item.unitPriceUsed)}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center", color: "var(--muted)" }}>
                    {item.gstRate}%
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>{item.qty}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {formatCurrencyInr(item.lineTotal)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary panel */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Summary</h4>
          {[
            ["Order Total", order.pricing?.productSubtotal],
            ["Item Discount", order.pricing?.discountAmount ? `-${formatCurrencyInr(order.pricing.discountAmount)}` : null],
            ["Taxable Amount", order.pricing?.taxableValue],
            [`GST`, order.pricing?.gstTotal],
            ["Shipping Charges", order.pricing?.shippingCharge],
          ].map(([label, val]) => val !== null && val !== undefined ? (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
              <span>{label}</span>
              <span style={{ color: typeof val === "string" && val.startsWith("-") ? "var(--danger)" : "var(--text)" }}>
                {typeof val === "string" ? val : formatCurrencyInr(val)}
              </span>
            </div>
          ) : null)}
          <div style={{ borderTop: "1.5px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
              <span>Total</span>
              <span>{formatCurrencyInr(order.orderTotal)}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800,
              color: "#fff", background: order.paymentStatus === "paid" ? "var(--success)" : "#d97706",
              borderRadius: 8, padding: "10px 12px"
            }}>
              <span>{order.paymentStatus === "paid" ? "Amount Paid" : "Amount Payable"}</span>
              <span>{formatCurrencyInr(order.orderTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice section */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Invoice</h4>
        <InvoiceSection invoice={invoice} onInvoiceUpdated={setInvoice} order={order} storeProfile={storeProfile} />
      </div>

      {/* Tracking info */}
      {order.trackingDetails?.trackingId && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Shipment &amp; Tracking</h4>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button" className="btn btn-secondary btn-small"
                onClick={() => { setEditTrackingModal(true); setEditTrackingError(""); }}
              >
                Edit
              </button>
              <button
                type="button" className="btn btn-secondary btn-small"
                onClick={() => printShippingLabel(order, storeProfile, order.trackingDetails)}
              >
                Download Shipping Label
              </button>
              <button
                type="button" className="btn btn-secondary btn-small"
                disabled={resendingTracking}
                onClick={handleResendTracking}
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#25d366" style={{ flexShrink: 0 }}>
                  <path d="M12 2a10 10 0 00-8.7 15l-1.2 5 5.1-1.3A10 10 0 1012 2zm5.1 13.4c-.2.6-1.2 1.2-1.7 1.3-.5.1-1.1.2-3.1-.6-2.4-1-4-3.5-4.1-3.7-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.5.5-.2.2-.3.4-.1.7.2.3 1 1.7 2.4 2.7 1.8 1.3 3.3 1.7 3.7 1.9.4.2.7.1.9-.1.3-.3 1-.9 1.2-1.2.2-.3.4-.3.7-.2l1.8.9c.3.2.5.3.6.5.1.2.1.9-.1 1.4z" />
                </svg>
                {resendingTracking ? "Sending…" : "Resend to Customer"}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <span><strong>Courier:</strong> {order.trackingDetails.courierName || "—"}</span>
            <span><strong>Tracking ID:</strong> {order.trackingDetails.trackingId}</span>
            {order.trackingDetails.dispatchDate && <span><strong>Dispatched:</strong> {order.trackingDetails.dispatchDate}</span>}
            {order.trackingDetails.expectedDeliveryDate && <span><strong>Expected:</strong> {order.trackingDetails.expectedDeliveryDate}</span>}
          </div>
          {order.trackingDetails.trackingUrl && (
            <a href={order.trackingDetails.trackingUrl} target="_blank" rel="noreferrer"
              style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: "var(--brand)", textDecoration: "none", fontWeight: 600 }}>
              Track shipment →
            </a>
          )}
        </div>
      )}

      {/* Notes */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Notes</h4>
        <NotesEditor order={order} onSave={handleNoteSave} saving={noteSaving} />
      </div>

      {/* Tags */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Tags</h4>
        <TagsEditor tags={order.tags} onSave={handleNoteSave} saving={noteSaving} />
      </div>

      {/* Fulfillment items (if any) */}
      {(order.fulfillmentItems || []).length > 0 && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Processing Items</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--muted)" }}>Sr#</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--muted)" }}>Product</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--muted)" }}>Fulfill Qty</th>
              </tr>
            </thead>
            <tbody>
              {order.fulfillmentItems.map((item, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px", color: "var(--muted)" }}>{item.srNo}</td>
                  <td style={{ padding: "8px 12px" }}>{item.title}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{item.fulfillQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 14 }}>{error}</p>}
      {invoiceError && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 14 }}>{invoiceError}</p>}

      {/* Single controlled pipeline action — one button drives Processing -> Invoice ->
          Shipping -> Delivered, so the same order can't be advanced out of order or
          twice by accident. */}
      <div className="order-detail-action-row" style={{ display: "flex", gap: 10, paddingTop: 8 }}>
        {canCancel && (
          <button type="button" className="btn btn-secondary" disabled={cancelSaving} onClick={handleCancelOrder}
            style={{ color: "var(--danger)", borderColor: "rgba(220,38,38,0.3)" }}>
            {cancelSaving ? "Cancelling…" : "Cancel Order"}
          </button>
        )}
        {orderStage === "new" && (
          <button type="button" className="btn btn-primary" onClick={() => { setProcessingModal(true); setProcessingError(""); }}>
            Mark as Processing
          </button>
        )}
        {orderStage === "ready_for_invoice" && (
          <button type="button" className="btn btn-primary" disabled={invoiceGenerating} onClick={handleGenerateInvoice}>
            {invoiceGenerating ? "Generating…" : "Generate Invoice"}
          </button>
        )}
        {orderStage === "ready_to_ship" && (
          <button type="button" className="btn btn-primary" style={{ background: "#16a34a" }}
            onClick={() => { setFulfillModal(true); setFulfillError(""); }}>
            Packed
          </button>
        )}
        {orderStage === "packed" && (
          <button type="button" className="btn btn-primary" style={{ background: "#7e22ce" }}
            disabled={printingLabel} onClick={handlePrintShippingLabel}>
            {printingLabel ? "Printing…" : "Print Shipping Address"}
          </button>
        )}
        {orderStage === "waiting_for_shipping" && (
          <button type="button" className="btn btn-primary" style={{ background: "#2563eb" }}
            disabled={markingShipped} onClick={handleMarkShipped}>
            {markingShipped ? "Marking…" : "Mark as Shipped"}
          </button>
        )}
        {orderStage === "shipped" && (
          <button type="button" className="btn btn-primary" style={{ background: "#2563eb" }}
            onClick={() => { setDeliveryModal(true); setDeliveryError(""); }}>
            Shipped
          </button>
        )}
        {orderStage === "delivered" && (
          <button type="button" className="btn btn-primary" disabled
            style={{ background: "#16a34a", opacity: 0.85, cursor: "default" }}>
            Delivered
          </button>
        )}
      </div>

      {/* Modals */}
      {processingModal && (
        <ProcessingModal
          order={order}
          onClose={() => setProcessingModal(false)}
          onSave={handleMarkProcessing}
          saving={processingSaving}
          error={processingError}
        />
      )}
      {fulfillModal && (
        <FulfillModal
          order={order}
          invoice={invoice}
          couriers={couriers}
          onClose={() => setFulfillModal(false)}
          onSave={handleFulfill}
          saving={fulfillSaving}
          error={fulfillError}
        />
      )}
      {deliveryModal && (
        <DeliveryConfirmModal
          onClose={() => setDeliveryModal(false)}
          onSave={handleMarkDelivered}
          saving={deliverySaving}
          error={deliveryError}
        />
      )}
      {editItemsModal && (
        <EditItemsModal
          order={order}
          onClose={() => setEditItemsModal(false)}
          onSave={handleEditItems}
          saving={editItemsSaving}
          error={editItemsError}
        />
      )}
    </div>
  );
}
