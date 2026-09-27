// HTML pieces for the "you left something in your cart" email, matching the
// redesigned /recover page (2026-09-27): product photos, where the buyer
// stopped, one clear step-aware button.
//
// Email-client rules: table layout + inline styles only (Outlook ignores
// flex/grid, Gmail strips <style>), absolute image URLs, no JavaScript.

const BRAND = "#E8231A";
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#eef0f3";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inr(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

// Where the buyer actually stopped. The "abandoned" stage overwrites that,
// so it is derived from what the record reached.
function resolveResumePoint(record) {
  const stage = String(record?.stage || "");
  if (stage === "recovered") return "ordered";
  if (stage === "payment_failed" || record?.failureReason) return "payment_failed";
  if (record?.paymentAttemptId || stage === "payment_pending") return "payment";
  if (record?.checkoutSessionId || stage === "checkout_started") return "checkout";
  return "cart";
}

const RESUME_COPY = {
  cart: { cta: "Continue to checkout", line: "We've kept everything ready — pick up right where you left off." },
  checkout: { cta: "Resume checkout", line: "You had started checkout — one click takes you straight back to it." },
  payment: { cta: "Complete your order", line: "You were on the payment step. Your order is one step away." },
  payment_failed: { cta: "Try payment again", line: "Your payment didn't complete. You can try again or choose another payment method." },
  ordered: { cta: "View my order", line: "" }
};

function leftAtText(iso) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return "";
  const d = new Date(t + IST_OFFSET_MS);
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const sameDay = d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  if (sameDay) return `today at ${time}`;
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  if (d.toISOString().slice(0, 10) === yesterday) return `yesterday at ${time}`;
  return `on ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}

// Product rows with photo. productsById: Map(productId -> catalog product).
function buildRecoveryItemsHtml(cartItems, productsById, siteOrigin) {
  const rows = ensureArray(cartItems).map((item) => {
    const product = productsById?.get?.(item.productId);
    const first = product && Array.isArray(product.images) ? product.images[0] : null;
    const imageUrl = first ? (typeof first === "string" ? first : first.thumbnail || first.url || "") : "";
    const slug = product?.slug || item.slug || "";
    const href = slug ? `${siteOrigin}/products/${encodeURIComponent(slug)}` : "";
    const qty = Math.max(1, Number(item.qty || 1));
    const lineTotal = Number(item.lineTotal || Number(item.unitPrice || 0) * qty);
    const unit = lineTotal > 0 ? lineTotal / qty : Number(item.unitPrice || 0);
    const available = product ? Boolean(product.isActive) && product.stockStatus !== "out_of_stock" : true;
    const title = esc(item.title || item.productId);
    const photo = imageUrl
      ? `<img src="${esc(imageUrl)}" width="64" height="64" alt="${title}" style="display:block;width:64px;height:64px;object-fit:contain;border:1px solid ${LINE};border-radius:10px;background:#f8fafc;">`
      : `<div style="width:64px;height:64px;line-height:64px;text-align:center;font-size:26px;border:1px solid ${LINE};border-radius:10px;background:#f8fafc;">📦</div>`;
    return (
      `<tr>` +
      `<td width="76" valign="top" style="padding:12px 12px 12px 0;border-top:1px solid ${LINE};">${href ? `<a href="${esc(href)}">${photo}</a>` : photo}</td>` +
      `<td valign="top" style="padding:12px 0;border-top:1px solid ${LINE};">` +
      `<div style="font-size:14px;font-weight:600;line-height:1.35;color:${INK};">${href ? `<a href="${esc(href)}" style="color:${INK};text-decoration:none;">${title}</a>` : title}</div>` +
      `<div style="font-size:12px;color:${MUTED};margin-top:4px;">Qty ${qty} × ${inr(unit)} <span style="font-size:11px;">(incl. GST)</span></div>` +
      `<div style="margin-top:6px;"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${available ? "#dcfce7" : "#fee2e2"};color:${available ? "#15803d" : "#b91c1c"};">${available ? "In stock — ready to ship" : "Currently unavailable"}</span></div>` +
      `</td>` +
      `<td valign="top" align="right" style="padding:12px 0;border-top:1px solid ${LINE};font-size:14px;font-weight:700;color:${INK};white-space:nowrap;">${inr(lineTotal)}</td>` +
      `</tr>`
    );
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.join("")}</table>`;
}

// Cart → Address & delivery → Payment → Order placed, marking where they stopped.
function buildProgressHtml(resumePoint) {
  const steps = ["Cart", "Address &amp; delivery", "Payment", "Order placed"];
  const keys = ["cart", "checkout", "payment", "ordered"];
  const current = resumePoint === "payment_failed" ? 2 : Math.max(0, keys.indexOf(resumePoint));
  const failed = resumePoint === "payment_failed";
  const cells = steps.map((label, i) => {
    const done = i < current;
    const here = i === current;
    const bg = done ? "#16a34a" : here ? (failed ? "#f59e0b" : BRAND) : "#e5e7eb";
    const fg = done || here ? "#ffffff" : MUTED;
    return (
      `<td align="center" valign="top" width="25%" style="padding:0 2px;">` +
      `<div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${bg};color:${fg};font-size:12px;font-weight:800;text-align:center;margin:0 auto;">${done ? "&#10003;" : i + 1}</div>` +
      `<div style="font-size:11px;line-height:1.3;margin-top:5px;color:${here ? INK : MUTED};font-weight:${here ? 700 : 500};">${label}</div>` +
      (here ? `<div style="font-size:10px;font-weight:700;margin-top:2px;color:${failed ? "#b45309" : BRAND};">${failed ? "Payment not completed" : "You stopped here"}</div>` : "") +
      `</td>`
    );
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0 4px;"><tr>${cells.join("")}</tr></table>`;
}

// All template variables for order_left_in_cart. Existing ones keep their
// meaning (itemsTable is now the photo version — also used by any customised
// template); the rest are new.
function buildRecoveryEmailVariables(record, supportInfo, productsById, siteOrigin) {
  const resumePoint = resolveResumePoint(record);
  const copy = RESUME_COPY[resumePoint] || RESUME_COPY.cart;
  const items = ensureArray(record.cartItems);
  const unitCount = items.reduce((s, i) => s + Number(i.qty || 0), 0);
  const itemsTotal = items.reduce((s, i) => s + Number(i.lineTotal || 0), 0);
  const cartTotal = Number(record.cartValue || 0);
  const firstName = String(record.customerName || "").trim().split(/\s+/)[0] || "";
  const itemsText = items.map((i) => `${i.title} × ${i.qty}`).join(", ");
  const wa = String(supportInfo?.supportWhatsApp || "").replace(/[^\d]/g, "");

  return {
    customerName: record.customerName || "there",
    firstName: firstName || "there",
    itemsTable: buildRecoveryItemsHtml(items, productsById, siteOrigin),
    orderTotal: inr(cartTotal),
    itemsTotal: inr(itemsTotal),
    itemCountText: `${unitCount} item${unitCount === 1 ? "" : "s"}`,
    leftAtText: leftAtText(record.lastActivityAt || record.updatedAt),
    resumeLine: copy.line,
    ctaLabel: copy.cta,
    progressHtml: buildProgressHtml(resumePoint),
    recoveryUrl: record.recoveryUrl,
    whatsappNumber: supportInfo?.supportWhatsApp || supportInfo?.supportPhone || "",
    // No WhatsApp configured → fall back to a call link rather than a dead href="".
    whatsappLink: wa
      ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I have a question about the items in my cart: ${itemsText}`)}`
      : supportInfo?.supportPhone
        ? `tel:${String(supportInfo.supportPhone).replace(/[^\d+]/g, "")}`
        : record.recoveryUrl
  };
}

module.exports = {
  resolveResumePoint,
  buildRecoveryItemsHtml,
  buildProgressHtml,
  buildRecoveryEmailVariables
};
