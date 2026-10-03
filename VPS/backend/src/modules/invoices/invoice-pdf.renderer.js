// A4 PDF invoice (2026-10-03). Same content and layout as renderInvoiceHtml
// in invoices.service.js, drawn with pdfkit so buyers get a real PDF that
// opens, prints and shares on every phone (the HTML attachment didn't).
// Text stays selectable; Inter font (embedded, subset) so ₹ renders.
// Only the PDF is new — the HTML invoice is unchanged and still used for
// admin preview/print.

const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

// Speed: text is laid out with the built-in Helvetica (fast, no embedding).
// Only strings Helvetica can't encode (₹, other Unicode) use embedded Inter —
// Inter is ~20x slower to measure, so it's kept to the few amount lines.
const FONT_DIR = path.join(path.dirname(require.resolve("inter-ui/package.json")), "Inter (web)");
const FONTS = {
  // .woff, not .woff2: pdfkit embedded the woff2 glyphs invisibly
  regular: path.join(FONT_DIR, "Inter-Regular.woff"),
  bold: path.join(FONT_DIR, "Inter-Bold.woff")
};
const BUILTIN = { R: "Helvetica", S: "Helvetica-Bold", B: "Helvetica-Bold" };
const UNICODE = { R: "IR", S: "IB", B: "IB" };
// Characters Helvetica (WinAnsi) can encode beyond Latin-1.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
function needsUnicodeFont(str) {
  for (const ch of String(str ?? "")) {
    const code = ch.codePointAt(0);
    if (code > 255 && !WIN_ANSI_EXTRA.has(ch)) return true;
  }
  return false;
}
function pickFont(font, str) {
  return needsUnicodeFont(str) ? UNICODE[font] || "IR" : BUILTIN[font] || "Helvetica";
}

const C = {
  ink: "#1c2129",
  sub: "#5b6472",
  line: "#dbe1e8",
  accent: "#14324f",
  accentSoft: "#eaf0f6",
  warn: "#b45309",
  warnSoft: "#fef3e0"
};

const PAGE = { width: 595.28, height: 841.89, margin: 34 };
const CONTENT_W = PAGE.width - PAGE.margin * 2;
const BOTTOM = PAGE.height - PAGE.margin - 22; // leave room for page number

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function inr(value) {
  return `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))}`;
}

function num(value) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function join(parts) {
  return parts.filter(Boolean).join(", ");
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

// Signature image only if it is one of our own uploads on this server.
function resolveLocalImage(url, uploadDir) {
  const match = String(url || "").match(/\/static\/uploads\/(.+)$/);
  if (!match || !uploadDir) return null;
  const file = path.resolve(process.cwd(), uploadDir, decodeURIComponent(match[1]));
  if (!file.startsWith(path.resolve(process.cwd(), uploadDir))) return null;
  if (!/\.(png|jpe?g)$/i.test(file) || !fs.existsSync(file)) return null;
  return file;
}

function renderInvoicePdf(invoice, helpers = {}) {
  const {
    formatInvoiceDateLabel = (v) => String(v || "--"),
    humanizePaymentMethodLabel = (v) => String(v || "--"),
    humanizeShippingMethodLabel = (v) => String(v || ""),
    humanizeLabel = (v) => String(v || ""),
    uploadDir = ""
  } = helpers;

  const seller = invoice.seller || {};
  const buyer = invoice.buyer || {};
  const shipping = invoice.shipping || buyer;
  const display = invoice.display || {};
  const pricing = invoice.pricing || {};
  const pos = invoice.placeOfSupply || {};
  const isProforma = invoice.documentType === "proforma_invoice";
  const sellerName = seller.legalBusinessName || seller.storeName || "Jenix India";

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    bufferPages: true,
    info: {
      Title: `${isProforma ? "Proforma Invoice" : "Tax Invoice"} ${invoice.invoiceNumber || ""}`.trim(),
      Author: sellerName,
      Subject: `Order ${invoice.orderNo || ""}`.trim()
    }
  });
  doc.registerFont("IR", FONTS.regular);
  doc.registerFont("IB", FONTS.bold);

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const L = PAGE.margin;
  let y = PAGE.margin;

  const text = (str, x, yy, opts = {}) => {
    const { font = "R", size = 9, color = C.ink, ...rest } = opts;
    doc.font(pickFont(font, str)).fontSize(size).fillColor(color).text(String(str ?? ""), x, yy, { lineGap: 1.5, ...rest });
  };
  const height = (str, width, font = "R", size = 9) =>
    doc.font(pickFont(font, str)).fontSize(size).heightOfString(String(str ?? ""), { width, lineGap: 1.5 });
  const hr = (yy, color = C.line, w = 0.8, x1 = L, x2 = L + CONTENT_W) => {
    doc.moveTo(x1, yy).lineTo(x2, yy).lineWidth(w).strokeColor(color).stroke();
  };
  const ensureSpace = (needed) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = PAGE.margin;
      return true;
    }
    return false;
  };

  // ── Masthead ──────────────────────────────────────────────────────────────
  const leftW = CONTENT_W * 0.56;
  const rightX = L + CONTENT_W * 0.58;
  const rightW = CONTENT_W * 0.42;
  text(sellerName, L, y, { font: "B", size: 15, width: leftW });
  let ly = y + height(sellerName, leftW, "B", 15) + 3;
  const contactLine = [seller.gstin ? `GSTIN ${seller.gstin}` : "", seller.supportEmail, seller.supportMobile].filter(Boolean).join("  ·  ");
  const sellerLines = [seller.address || "Seller address not configured", contactLine].filter(Boolean).join("\n");
  text(sellerLines, L, ly, { size: 8.5, color: C.sub, width: leftW });
  ly += height(sellerLines, leftW, "R", 8.5);

  let ry = y;
  text(isProforma ? "PROFORMA INVOICE" : "TAX INVOICE", rightX, ry, { font: "B", size: 16, color: isProforma ? C.warn : C.accent, width: rightW, align: "right" });
  ry += 22;
  if (isProforma) {
    text("Not a tax invoice — payment pending", rightX, ry, { size: 8, color: C.warn, width: rightW, align: "right" });
    ry += 13;
  }
  text(`Invoice Number:  ${invoice.invoiceNumber || "--"}`, rightX, ry, { font: "S", size: 9.5, width: rightW, align: "right" });
  ry += 14;
  const dateLine = `Invoice Date: ${formatInvoiceDateLabel(invoice.invoiceDate)}
Order: ${invoice.orderNo || invoice.orderId || "--"}`;
  text(dateLine, rightX, ry, { size: 8.5, color: C.sub, width: rightW, align: "right" });
  ry += height(dateLine, rightW, "R", 8.5);

  y = Math.max(ly, ry) + 10;
  hr(y, C.accent, 1.4);
  y += 12;

  // ── Billed To / Ship To ───────────────────────────────────────────────────
  const boxGap = 12;
  const boxW = (CONTENT_W - boxGap) / 2;
  const pad = 9;
  const buyerAddress = join([buyer.addressLine1, buyer.addressLine2, buyer.city, buyer.state, buyer.pincode, buyer.country]);
  const shipAddress = join([shipping.addressLine1, shipping.addressLine2, shipping.city, shipping.state, shipping.pincode, shipping.country]);
  const billLines = [
    { t: "BILLED TO", font: "S", size: 7.5, color: C.sub },
    { t: buyer.companyName || buyer.name || "Customer", font: "B", size: 10.5 },
    buyer.companyName && buyer.name ? { t: buyer.name, size: 8.5, color: C.sub } : null,
    { t: buyerAddress || "Buyer address not available", size: 8.5, color: C.sub },
    { t: `Mobile: ${buyer.mobile || "--"}   Email: ${buyer.email || "--"}`, size: 8.5 },
    buyer.gstin ? { t: `GSTIN: ${buyer.gstin}`, font: "S", size: 8.5 } : null
  ].filter(Boolean);
  const shipLines = [
    { t: "SHIP TO", font: "S", size: 7.5, color: C.sub },
    { t: shipping.companyName || shipping.name || buyer.companyName || buyer.name || "Customer", font: "B", size: 10.5 },
    { t: shipAddress || buyerAddress || "Shipping address not available", size: 8.5, color: C.sub },
    { t: `Mobile: ${shipping.mobile || buyer.mobile || "--"}`, size: 8.5 },
    shipping.sameAsBilling === false ? null : { t: "Same address as Billed To.", size: 7.5, color: C.sub }
  ].filter(Boolean);
  const blockHeight = (lines) => lines.reduce((h, l) => h + height(l.t, boxW - pad * 2, l.font || "R", l.size) + 2.5, 0) + pad * 2;
  const boxH = Math.max(blockHeight(billLines), blockHeight(shipLines));
  const drawBlock = (lines, x) => {
    doc.roundedRect(x, y, boxW, boxH, 4).lineWidth(0.8).strokeColor(C.line).stroke();
    let by = y + pad;
    for (const l of lines) {
      text(l.t, x + pad, by, { font: l.font || "R", size: l.size, color: l.color || C.ink, width: boxW - pad * 2 });
      by += height(l.t, boxW - pad * 2, l.font || "R", l.size) + 2.5;
    }
  };
  drawBlock(billLines, L);
  drawBlock(shipLines, L + boxW + boxGap);
  y += boxH + 10;

  // ── Meta strip ────────────────────────────────────────────────────────────
  const shipLabel = humanizeShippingMethodLabel(pricing.shippingMethod);
  const meta = [
    `Place of Supply: ${join([pos.state, pos.stateCode ? `(${pos.stateCode})` : ""]).replace(", (", " (") || "--"}`,
    `Payment: ${invoice.paymentStatus === "paid" ? "Paid" : "Pending"} — ${humanizePaymentMethodLabel(invoice.paymentMethod)}`,
    shipLabel ? `Shipping Method: ${shipLabel}` : "",
    "Reverse Charge: No"
  ].filter(Boolean).join("     ");
  const metaH = height(meta, CONTENT_W - 16, "R", 8) + 10;
  doc.rect(L, y, CONTENT_W, metaH).fill(C.accentSoft);
  text(meta, L + 8, y + 5, { size: 8, color: C.ink, width: CONTENT_W - 16 });
  y += metaH + 10;

  // ── Items table ───────────────────────────────────────────────────────────
  const cols = [
    { key: "sr", title: "Sr", w: 24, align: "left" },
    { key: "desc", title: "Item Description", w: 0, align: "left" },
    { key: "hsn", title: "HSN/SAC", w: 58, align: "left" },
    { key: "qty", title: "Qty", w: 34, align: "right" },
    { key: "rate", title: "Rate w/o GST", w: 72, align: "right" },
    { key: "per", title: "Per", w: 30, align: "left" },
    { key: "amt", title: "Amount", w: 78, align: "right" }
  ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols[1].w = CONTENT_W - fixed;
  const cellPad = 5;
  const drawRow = (cells, opts = {}) => {
    const { font = "R", size = 8.5, fill = null, color = C.ink, border = true } = opts;
    const h = Math.max(...cols.map((c) => height(cells[c.key] ?? "", c.w - cellPad * 2, font, size))) + cellPad * 2;
    if (fill) doc.rect(L, y, CONTENT_W, h).fill(fill);
    let x = L;
    for (const c of cols) {
      text(cells[c.key] ?? "", x + cellPad, y + cellPad, { font, size, color, width: c.w - cellPad * 2, align: c.align });
      x += c.w;
    }
    if (border) hr(y + h, C.line, 0.6);
    y += h;
    return h;
  };
  const header = { sr: "Sr", desc: "Item Description", hsn: "HSN/SAC", qty: "Qty", rate: "Rate w/o GST", per: "Per", amt: "Amount" };
  const drawHeader = () => drawRow(header, { font: "S", size: 7.8, fill: C.accentSoft, color: C.accent });
  drawHeader();

  const items = ensureArray(invoice.items);
  let qtyTotal = 0;
  let amountTotal = 0;
  items.forEach((item, index) => {
    const qty = Number(item.qty || 0);
    const taxable = Number(item.taxableValue || 0);
    qtyTotal += qty;
    amountTotal += taxable;
    const rate = qty > 0 ? round2(taxable / qty) : 0;
    const shipNote = item.shippingClass && item.shippingClass !== "normal" ? `\nShipping: ${humanizeLabel(item.shippingClass)}` : "";
    const cells = { sr: String(index + 1), desc: `${item.title || "Item"}${shipNote}`, hsn: item.hsnCode || "--", qty: String(qty), rate: num(rate), per: "Nos", amt: num(taxable) };
    const need = Math.max(...cols.map((c) => height(cells[c.key], c.w - cellPad * 2, "R", 8.5))) + cellPad * 2;
    if (ensureSpace(need)) drawHeader();
    drawRow(cells);
  });
  if (ensureSpace(24)) drawHeader();
  drawRow({ sr: "", desc: "Total", hsn: "", qty: String(qtyTotal), rate: "", per: "", amt: num(round2(amountTotal)) }, { font: "B", size: 8.5 });
  y += 10;

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalsRows = [["Product Subtotal", inr(pricing.productSubtotal)]];
  if (display.showShippingLine !== false || Number(pricing.shippingCharge || 0) !== 0) {
    totalsRows.push([`Shipping${shipLabel ? ` (${shipLabel})` : ""}`, inr(pricing.shippingCharge)]);
  }
  if (display.showDiscountLine !== false || Number(pricing.discountAmount || 0) !== 0) {
    totalsRows.push(["Discount", `${Number(pricing.discountAmount || 0) > 0 ? "−" : ""}${inr(pricing.discountAmount)}`]);
  }
  if (Number(pricing.mdrAmount || 0) !== 0) {
    totalsRows.push([`Payment Processing Charges (MDR${pricing.mdrPercent ? ` @ ${pricing.mdrPercent}%` : ""})`, inr(pricing.mdrAmount)]);
  }
  totalsRows.push(["Taxable Value", inr(pricing.taxableValue)]);
  if (pos.isIntraState) {
    totalsRows.push(["CGST Total", inr(pricing.cgstTotal)]);
    totalsRows.push(["SGST Total", inr(pricing.sgstTotal)]);
  } else {
    totalsRows.push(["IGST Total", inr(pricing.igstTotal)]);
  }
  totalsRows.push(["Round Off", inr(pricing.roundOff)]);
  const tW = 250;
  const tX = L + CONTENT_W - tW;
  ensureSpace(totalsRows.length * 15 + 30);
  for (const [label, value] of totalsRows) {
    text(label, tX, y, { size: 8.8, color: C.sub, width: tW - 100 });
    text(value, tX + tW - 110, y, { size: 8.8, width: 110, align: "right" });
    y += 15;
  }
  hr(y, C.ink, 1, tX, tX + tW);
  y += 5;
  text("Grand Total", tX, y, { font: "B", size: 11, width: tW - 120 });
  text(inr(pricing.grandTotal), tX + tW - 130, y, { font: "B", size: 11, color: C.accent, width: 130, align: "right" });
  y += 24;

  // ── HSN summary ───────────────────────────────────────────────────────────
  const hsnRows = display.showHsnSummary !== false ? ensureArray(invoice.hsnSummary) : [];
  if (hsnRows.length) {
    ensureSpace(40 + hsnRows.length * 16);
    text("HSN Summary", L, y, { font: "S", size: 9, color: C.accent });
    y += 14;
    const hCols = pos.isIntraState
      ? [["HSN/SAC", 0.24, "left"], ["Taxable Value", 0.22, "right"], ["CGST", 0.18, "right"], ["SGST", 0.18, "right"], ["Total Tax", 0.18, "right"]]
      : [["HSN/SAC", 0.28, "left"], ["Taxable Value", 0.26, "right"], ["IGST", 0.23, "right"], ["Total Tax", 0.23, "right"]];
    const drawH = (vals, font, fill, color = C.ink) => {
      const h = 16;
      if (fill) doc.rect(L, y, CONTENT_W, h).fill(fill);
      let x = L;
      hCols.forEach(([_, frac, align], i) => {
        const w = CONTENT_W * frac;
        text(vals[i], x + 5, y + 4, { font, size: 8, color, width: w - 10, align });
        x += w;
      });
      hr(y + h, C.line, 0.6);
      y += h;
    };
    drawH(hCols.map((c) => c[0]), "S", C.accentSoft, C.accent);
    for (const r of hsnRows) {
      ensureSpace(16);
      drawH(
        pos.isIntraState
          ? [r.hsnCode || "--", num(r.taxableValue), num(r.cgstAmount), num(r.sgstAmount), num(r.totalTaxAmount)]
          : [r.hsnCode || "--", num(r.taxableValue), num(r.igstAmount), num(r.totalTaxAmount)],
        "R"
      );
    }
    y += 12;
  }

  // ── Additional details ────────────────────────────────────────────────────
  const customFields = ensureArray(display.customInvoiceFields).filter((f) => f?.label && f?.value);
  if (customFields.length) {
    ensureSpace(20 + customFields.length * 15);
    text("Additional Details", L, y, { font: "S", size: 9, color: C.accent });
    y += 14;
    for (const f of customFields) {
      const h = Math.max(height(f.value, CONTENT_W - 170, "R", 8.5), 12);
      ensureSpace(h + 4);
      text(f.label, L, y, { size: 8.5, color: C.sub, width: 160 });
      text(f.value, L + 170, y, { size: 8.5, width: CONTENT_W - 170 });
      y += h + 4;
    }
    y += 8;
  }

  // ── Bank details + signatory ──────────────────────────────────────────────
  const bank = [
    ["Bank", seller.bankName],
    ["Account Holder", seller.accountHolderName],
    ["Account No.", seller.accountNumber],
    ["IFSC", seller.ifsc],
    ["UPI ID", seller.upiId]
  ].filter(([, v]) => v);
  const showBank = display.showBankDetails !== false && bank.length;
  const sigImage = resolveLocalImage(display.authorizedSignatoryImageUrl, uploadDir);
  ensureSpace(Math.max(showBank ? 22 + bank.length * 13 : 0, sigImage ? 110 : 80));
  const blockTop = y;
  if (showBank) {
    text("Payment Details", L, y, { font: "S", size: 9, color: C.accent });
    let by = y + 14;
    for (const [k, v] of bank) {
      text(`${k}:`, L, by, { font: "S", size: 8.5, width: 90 });
      text(v, L + 92, by, { size: 8.5, width: CONTENT_W / 2 - 100 });
      by += 13;
    }
    y = Math.max(y, by);
  }
  const sX = L + CONTENT_W - 200;
  let sy = blockTop;
  if (sigImage) {
    try {
      doc.image(sigImage, sX + 50, sy, { fit: [150, 50], align: "right" });
    } catch (_e) {
      // unreadable image — skip, the signature line is enough
    }
    sy += 54;
  } else {
    text(`For ${sellerName}`, sX, sy, { size: 8.5, color: C.sub, width: 200, align: "right" });
    sy += 44;
  }
  if (sigImage) {
    text(`For ${sellerName}`, sX, sy, { size: 8.5, color: C.sub, width: 200, align: "right" });
    sy += 14;
  }
  hr(sy, C.ink, 0.8, sX + 30, sX + 200);
  text("Authorised Signatory", sX, sy + 4, { size: 8, color: C.sub, width: 200, align: "right" });
  y = Math.max(y, sy + 18) + 10;

  // ── Terms / footer ────────────────────────────────────────────────────────
  const footer = join([display.terms, display.footer]);
  if (footer) {
    const h = height(footer, CONTENT_W, "R", 7.8);
    ensureSpace(h + 14);
    hr(y, C.line, 0.6);
    text(footer, L, y + 7, { size: 7.8, color: C.sub, width: CONTENT_W });
    y += h + 14;
  }

  // ── Page numbers ──────────────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // writing inside the bottom margin must not add a page
    const label = `${invoice.invoiceNumber || ""}  ·  Page ${i + 1} of ${range.count}  ·  This is a computer-generated invoice.`;
    doc.font(pickFont("R", label)).fontSize(7).fillColor(C.sub).text(label, L, PAGE.height - PAGE.margin - 8, { width: CONTENT_W, align: "center", lineBreak: false });
  }

  doc.end();
  return done;
}

module.exports = { renderInvoicePdf };
