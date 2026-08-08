const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { readInvoiceStore, writeInvoiceStore } = require("../../database/invoice-store");
const { jsonFileStore } = require("../../database/json-file-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { resolveGstStateCode, resolveGstStateName } = require("../../common/india-gst-states");
const {
  roundMoney,
  ensureArray,
  ensureInvoiceStoreShape,
  sanitizeInvoice,
  sanitizeInvoiceSummary,
  resolveFinancialYearLabel,
  buildInvoiceNumber,
  buildProformaInvoiceNumber
} = require("./invoices.model");

function nowIso() {
  return new Date().toISOString();
}

function formatDateOnly(dateInput) {
  return new Date(dateInput || Date.now()).toISOString().slice(0, 10);
}

function normalizeStateCode(value) {
  return resolveGstStateCode(value);
}

// Free-text address forms let a state code and state name land in either field —
// try the code field first, then fall back to resolving the name field, so a stray
// "RAJASTHAN" typed into either box still resolves to "08" instead of mismatching.
function resolveStateCodeFromFields(codeValue, nameValue) {
  return normalizeStateCode(codeValue) || normalizeStateCode(nameValue);
}

function ensureAuthStoreShape(store) {
  if (!Array.isArray(store.orders)) {
    store.orders = [];
  }
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
}

function resolveSellerSnapshot(settings) {
  const storeProfile = settings.storeProfile || {};
  const invoiceSettings = settings.invoiceSettings || {};
  const sellerStateCode = resolveStateCodeFromFields(storeProfile.stateCode, storeProfile.state);

  return {
    storeName: storeProfile.storeName || "Jenix India",
    legalBusinessName: storeProfile.legalBusinessName || "",
    gstin: storeProfile.gstin || "",
    address: storeProfile.address || "",
    state: storeProfile.state || resolveGstStateName(sellerStateCode) || "",
    stateCode: sellerStateCode,
    supportEmail: storeProfile.supportEmail || "",
    supportMobile: storeProfile.supportMobile || "",
    whatsappNumber: storeProfile.whatsappNumber || "",
    pickupAddress: storeProfile.pickupAddress || "",
    bankName: storeProfile.bankName || "",
    accountHolderName: storeProfile.accountHolderName || "",
    accountNumber: storeProfile.accountNumber || "",
    ifsc: storeProfile.ifsc || "",
    upiId: storeProfile.upiId || "",
    logoUrl: invoiceSettings.invoiceLogoUrl || settings.branding?.invoiceLogoUrl || ""
  };
}

function resolveBuyerSource(order) {
  const billingAddress = order.billingAddress || {};
  const shippingAddress = order.shippingAddress || {};
  return Object.keys(billingAddress).length > 0 ? billingAddress : shippingAddress;
}

function resolveBuyerSnapshot(order, authStore) {
  const source = resolveBuyerSource(order);
  const customer = order.userId
    ? ensureArray(authStore.users).find((user) => user.id === order.userId)
    : null;
  const buyerStateCode = resolveStateCodeFromFields(source.stateCode, source.state);

  return {
    name: source.name || customer?.name || "Customer",
    companyName: source.companyName || "",
    email: source.email || customer?.email || "",
    mobile: source.mobile || customer?.mobile || "",
    gstin: source.gstin || source.gstNumber || "",
    addressLine1:
      source.addressLine1 || source.address || source.line1 || source.street || "",
    addressLine2: source.addressLine2 || source.line2 || "",
    city: source.city || "",
    state: source.state || resolveGstStateName(buyerStateCode) || "",
    stateCode: buyerStateCode,
    pincode: String(source.pincode || "").trim(),
    country: source.country || "India"
  };
}

// Ship-To is only rendered as a distinct block when the shipping address is both
// present and materially different from the billing address; otherwise the invoice
// shows the same data in both columns instead of a separate, possibly-stale block.
function resolveShippingSnapshot(order, authStore, billingSnapshot) {
  const shippingAddress = order.shippingAddress || {};
  if (!shippingAddress || Object.keys(shippingAddress).length === 0) {
    return { ...billingSnapshot, sameAsBilling: true };
  }

  const customer = order.userId
    ? ensureArray(authStore.users).find((user) => user.id === order.userId)
    : null;
  const shipStateCode = resolveStateCodeFromFields(shippingAddress.stateCode, shippingAddress.state);

  const shipping = {
    name: shippingAddress.name || customer?.name || billingSnapshot.name,
    companyName: shippingAddress.companyName || "",
    addressLine1:
      shippingAddress.addressLine1 ||
      shippingAddress.address ||
      shippingAddress.line1 ||
      shippingAddress.street ||
      "",
    addressLine2: shippingAddress.addressLine2 || shippingAddress.line2 || "",
    city: shippingAddress.city || "",
    state: shippingAddress.state || resolveGstStateName(shipStateCode) || "",
    stateCode: shipStateCode,
    pincode: String(shippingAddress.pincode || "").trim(),
    country: shippingAddress.country || "India",
    mobile: shippingAddress.mobile || billingSnapshot.mobile
  };

  const sameAsBilling =
    shipping.addressLine1 === billingSnapshot.addressLine1 &&
    shipping.addressLine2 === billingSnapshot.addressLine2 &&
    shipping.city === billingSnapshot.city &&
    shipping.stateCode === billingSnapshot.stateCode &&
    shipping.pincode === billingSnapshot.pincode;

  return { ...shipping, sameAsBilling };
}

function resolvePlaceOfSupply(seller, buyer) {
  const buyerStateCode = normalizeStateCode(buyer.stateCode);
  const sellerStateCode = normalizeStateCode(seller.stateCode);
  const finalBuyerStateCode = buyerStateCode || sellerStateCode;
  const intraState =
    Boolean(finalBuyerStateCode) &&
    Boolean(sellerStateCode) &&
    finalBuyerStateCode === sellerStateCode;

  return {
    state: buyer.state || seller.state || "",
    stateCode: finalBuyerStateCode,
    taxMode: intraState ? "cgst_sgst" : "igst",
    isIntraState: intraState
  };
}

function splitTaxAmounts(gstRate, gstAmount, isIntraState) {
  const totalRate = Number(gstRate || 0);
  const totalAmount = Number(gstAmount || 0);

  if (!isIntraState) {
    return {
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: totalRate,
      igstAmount: roundMoney(totalAmount)
    };
  }

  const cgstRate = roundMoney(totalRate / 2);
  const sgstRate = roundMoney(totalRate - cgstRate);
  const cgstAmount = roundMoney(totalAmount / 2);
  const sgstAmount = roundMoney(totalAmount - cgstAmount);

  return {
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate: 0,
    igstAmount: 0
  };
}

function buildOrderItemSnapshot(orderItem, productLookup, placeOfSupply) {
  const product = productLookup.get(orderItem.productId);
  const taxSplit = splitTaxAmounts(
    Number(orderItem.gstRate || 0),
    Number(orderItem.gstAmount || 0),
    placeOfSupply.isIntraState
  );

  return {
    productId: orderItem.productId,
    title: orderItem.title || product?.title || "",
    sku: orderItem.sku || product?.sku || "",
    hsnCode: orderItem.hsnCode || product?.hsnCode || "",
    qty: Number(orderItem.qty || 0),
    finalUnitPrice: Number(orderItem.finalUnitPrice || 0),
    taxableValue: Number(orderItem.taxableValue || 0),
    gstRate: Number(orderItem.gstRate || 0),
    gstAmount: Number(orderItem.gstAmount || 0),
    lineTotal: Number(orderItem.lineTotal || 0),
    ...taxSplit
  };
}

function buildHsnSummary(items) {
  const summaryMap = new Map();

  for (const item of ensureArray(items)) {
    const key = `${item.hsnCode || "NA"}::${Number(item.gstRate || 0)}`;
    const current = summaryMap.get(key) || {
      hsnCode: item.hsnCode || "",
      gstRate: Number(item.gstRate || 0),
      taxableValue: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalTaxAmount: 0,
      lineTotal: 0
    };

    current.taxableValue = roundMoney(current.taxableValue + Number(item.taxableValue || 0));
    current.cgstAmount = roundMoney(current.cgstAmount + Number(item.cgstAmount || 0));
    current.sgstAmount = roundMoney(current.sgstAmount + Number(item.sgstAmount || 0));
    current.igstAmount = roundMoney(current.igstAmount + Number(item.igstAmount || 0));
    current.totalTaxAmount = roundMoney(
      current.totalTaxAmount + Number(item.gstAmount || 0)
    );
    current.lineTotal = roundMoney(current.lineTotal + Number(item.lineTotal || 0));

    summaryMap.set(key, current);
  }

  return [...summaryMap.values()];
}

function formatSubHundred(value) {
  const words = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen"
  ];
  const tensWords = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety"
  ];

  if (value < 20) {
    return words[value];
  }

  const tens = Math.floor(value / 10);
  const unit = value % 10;
  return `${tensWords[tens]}${unit ? ` ${words[unit]}` : ""}`.trim();
}

function formatSubThousand(value) {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts = [];

  if (hundreds > 0) {
    parts.push(`${formatSubHundred(hundreds)} Hundred`);
  }
  if (rest > 0) {
    parts.push(formatSubHundred(rest));
  }

  return parts.join(" ").trim();
}

function integerToIndianWords(value) {
  if (value === 0) {
    return "Zero";
  }

  const groups = [
    { size: 10000000, label: "Crore" },
    { size: 100000, label: "Lakh" },
    { size: 1000, label: "Thousand" }
  ];

  let remainder = value;
  const parts = [];

  for (const group of groups) {
    if (remainder >= group.size) {
      const count = Math.floor(remainder / group.size);
      parts.push(`${formatSubThousand(count)} ${group.label}`.trim());
      remainder %= group.size;
    }
  }

  if (remainder > 0) {
    parts.push(formatSubThousand(remainder));
  }

  return parts.join(" ").trim();
}

function amountToWords(amount) {
  const absolute = Math.abs(Number(amount || 0));
  const rupees = Math.floor(absolute);
  const paise = Math.round((absolute - rupees) * 100);
  const rupeesWords = integerToIndianWords(rupees);
  const paiseWords = paise > 0 ? integerToIndianWords(paise) : "";

  if (paise > 0) {
    return `Rupees ${rupeesWords} and ${paiseWords} Paise Only`;
  }

  return `Rupees ${rupeesWords} Only`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrencyInr(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

// Same numeric formatting as formatCurrencyInr but without the ₹ symbol — the
// approved invoice redesign only shows the currency symbol in the Totals
// block; the line-items and HSN tables show bare numbers (matches Tally).
function formatNumberInr(value) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatInvoiceDateLabel(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    }).format(date);
  }

  const fallback = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isNaN(fallback.getTime())) {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    }).format(fallback);
  }

  return String(value);
}

function formatPercent(value) {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric) ? `${numeric}%` : `${numeric.toFixed(2)}%`;
}

function joinTextParts(parts) {
  return parts.filter(Boolean).join(", ");
}

function renderInfoPairs(entries) {
  return entries
    .map(
      ([label, value]) => `
        <div class="meta-card">
          <span class="meta-label">${escapeHtml(label)}</span>
          <strong>${escapeHtml(value || "--")}</strong>
        </div>
      `
    )
    .join("");
}

function humanizePaymentMethodLabel(method) {
  const labels = {
    online: "Online",
    razorpay: "Online (Razorpay)",
    cashfree: "Online (Cashfree)",
    manual_upi: "Manual UPI",
    direct_bank_transfer: "Bank Transfer",
    cod: "Cash on Delivery"
  };
  return labels[method] || (method ? String(method) : "--");
}

function renderInvoiceHtml(invoice) {
  const seller = invoice.seller || {};
  const buyer = invoice.buyer || {};
  const shipping = invoice.shipping || buyer;
  const display = invoice.display || {};
  const pricing = invoice.pricing || {};
  const placeOfSupply = invoice.placeOfSupply || {};
  const isProforma = invoice.documentType === "proforma_invoice";
  const shipToAddress = joinTextParts([
    shipping.addressLine1,
    shipping.addressLine2,
    shipping.city,
    shipping.state,
    shipping.pincode,
    shipping.country
  ]);
  const buyerAddress = joinTextParts([
    buyer.addressLine1,
    buyer.addressLine2,
    buyer.city,
    buyer.state,
    buyer.pincode,
    buyer.country
  ]);
  const sellerContactLine = [
    seller.gstin ? `GSTIN ${escapeHtml(seller.gstin)}` : "",
    seller.supportEmail ? escapeHtml(seller.supportEmail) : "",
    seller.supportMobile ? escapeHtml(seller.supportMobile) : ""
  ]
    .filter(Boolean)
    .join(" &middot; ");
  const sellerBrandLine = [
    escapeHtml(seller.address || "Seller address not configured"),
    sellerContactLine
  ]
    .filter(Boolean)
    .join("<br>");

  // Tally's sales-invoice entry format: Sr No / Description / HSN-or-SAC / Qty /
  // Rate WITHOUT GST / Per / Amount. GST itself is summarized separately in the
  // Totals block below, not per line — so "Rate" and "Amount" here are always the
  // pre-tax taxableValue, never the GST-inclusive finalUnitPrice.
  const invoiceItems = ensureArray(invoice.items);
  const itemsQtyTotal = invoiceItems.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const itemsAmountTotal = roundMoney(
    invoiceItems.reduce((sum, item) => sum + Number(item.taxableValue || 0), 0)
  );
  const itemsHtml = invoiceItems
    .map((item, index) => {
      const qty = Number(item.qty || 0);
      const rateWithoutGst = qty > 0 ? roundMoney(Number(item.taxableValue || 0) / qty) : 0;
      return `
        <tr>
          <td class="sr">${index + 1}</td>
          <td>${escapeHtml(item.title || "Item")}</td>
          <td>${escapeHtml(item.hsnCode || "--")}</td>
          <td class="num">${escapeHtml(String(qty))}</td>
          <td class="num">${escapeHtml(formatNumberInr(rateWithoutGst))}</td>
          <td>Nos</td>
          <td class="num">${escapeHtml(formatNumberInr(item.taxableValue || 0))}</td>
        </tr>
      `;
    })
    .join("");

  // HSN summary splits by CGST+SGST or IGST to match the Totals block below —
  // never both, matching whichever tax pairing actually applies for this order.
  const hsnRows = display.showHsnSummary !== false ? ensureArray(invoice.hsnSummary) : [];
  const hsnSummaryHtml = hsnRows.length
    ? `
      <div class="hsn-summary">
        <div class="h-title">HSN Summary</div>
        <table class="hsn">
          <thead>
            <tr>
              <th>HSN/SAC</th>
              <th class="num">Taxable Value</th>
              ${
                placeOfSupply.isIntraState
                  ? `<th class="num">CGST</th><th class="num">SGST</th>`
                  : `<th class="num">IGST</th>`
              }
              <th class="num">Total Tax</th>
            </tr>
          </thead>
          <tbody>
            ${hsnRows
              .map(
                (row) => `
                  <tr>
                    <td>${escapeHtml(row.hsnCode || "--")}</td>
                    <td class="num">${escapeHtml(formatNumberInr(row.taxableValue || 0))}</td>
                    ${
                      placeOfSupply.isIntraState
                        ? `<td class="num">${escapeHtml(formatNumberInr(row.cgstAmount || 0))}</td><td class="num">${escapeHtml(formatNumberInr(row.sgstAmount || 0))}</td>`
                        : `<td class="num">${escapeHtml(formatNumberInr(row.igstAmount || 0))}</td>`
                    }
                    <td class="num">${escapeHtml(formatNumberInr(row.totalTaxAmount || 0))}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : "";

  const bankDetails = [];
  if (seller.bankName) {
    bankDetails.push(["Bank", seller.bankName]);
  }
  if (seller.accountHolderName) {
    bankDetails.push(["Account Holder", seller.accountHolderName]);
  }
  if (seller.accountNumber) {
    bankDetails.push(["Account No.", seller.accountNumber]);
  }
  if (seller.ifsc) {
    bankDetails.push(["IFSC", seller.ifsc]);
  }
  if (seller.upiId) {
    bankDetails.push(["UPI ID", seller.upiId]);
  }

  const customFields = ensureArray(display.customInvoiceFields).filter(
    (field) => field?.label && field?.value
  );
  const customFieldsHtml = customFields.length
    ? `
      <div class="hsn-summary">
        <div class="h-title">Additional Details</div>
        <table class="hsn">
          <tbody>
            ${customFields
              .map(
                (field) =>
                  `<tr><td style="width:220px;">${escapeHtml(field.label)}</td><td>${escapeHtml(field.value)}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : "";

  // The approved redesign doesn't have a dedicated Terms/Notes panel — fold
  // any configured terms/footer text into one small print line at the very
  // bottom instead of dropping it outright.
  const footerNote = joinTextParts([display.terms, display.footer]);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(invoice.invoiceNumber || "Invoice")}</title>
    <style>
      /* No @page rule meant printing this HTML fell back to the browser's
         default print margin (~0.5in/side on A4), leaving under 720px of
         content width — which silently trips the .party-grid/.bottom-grid
         @media (max-width:720px) mobile fallback further down, stacking
         the 2-column Bill-To/Ship-To grid into 1 column and spilling the
         invoice onto a second page. Confirmed live. This applies no
         matter how the HTML is printed — admin panel's combined
         invoice+label flow, a plain downloaded file opened and printed
         directly, or anything else — since it's baked into the template
         itself rather than injected only by one caller. */
      @page { size: A4; margin: 10mm 6mm; }
      :root{
        --ink:#1c2129; --sub:#5b6472; --line:#dbe1e8; --paper:#ffffff;
        --accent:#14324f; --accent-soft:#eaf0f6;
        --warn:#b45309; --warn-soft:#fef3e0;
      }
      *{ box-sizing:border-box; }
      body{
        background:#eef1f4; margin:0; padding:24px 16px 48px;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
        color:var(--ink);
      }
      .paper-wrap{ display:flex; justify-content:center; }
      .paper{
        width:100%; max-width:900px; background:var(--paper);
        border:1px solid var(--line); border-radius:4px;
        padding:30px 34px 26px;
      }
      .masthead{
        display:flex; justify-content:space-between; align-items:flex-start;
        padding-bottom:16px; border-bottom:2px solid var(--ink); margin-bottom:16px; gap:16px;
      }
      .masthead .brand{ font-size:17px; font-weight:800; letter-spacing:-0.01em; }
      .masthead .brand-line{ font-size:11.5px; color:var(--sub); margin-top:3px; line-height:1.5; max-width:380px; }
      .masthead .doc-type{ text-align:right; flex-shrink:0; }
      .masthead .doc-type h2{ margin:0; font-size:20px; letter-spacing:0.03em; font-weight:800; }
      .doc-type.tax h2{ color:var(--accent); }
      .doc-type.proforma h2{ color:var(--warn); }
      .proforma-note{
        display:inline-block; margin-top:5px; font-size:10px; font-weight:700; letter-spacing:0.04em;
        text-transform:uppercase; background:var(--warn-soft); color:var(--warn);
        padding:3px 8px; border-radius:4px; border:1px solid #f3d9ad;
      }
      .inv-no-row{ margin-top:9px; font-size:13px; }
      .inv-no-row .label{ color:var(--sub); margin-right:6px; }
      .inv-no-row .value{ font-weight:700; }
      .inv-date-row{ margin-top:3px; font-size:11.5px; color:var(--sub); }
      .party-grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:18px; }
      .party-block{ border:1px solid var(--line); border-radius:6px; padding:13px 15px; }
      .party-block .party-label{
        font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;
        color:var(--accent); margin-bottom:8px;
      }
      .party-block .party-name{ font-size:13.5px; font-weight:700; margin-bottom:3px; }
      .party-block .party-line{ font-size:12px; color:var(--sub); line-height:1.55; }
      .party-block .party-line strong{ color:var(--ink); font-weight:600; }
      .same-as-billing{ margin-top:8px; font-size:10.5px; color:var(--sub); font-style:italic; }
      .meta-strip{
        display:flex; gap:22px; flex-wrap:wrap; font-size:11.5px; color:var(--sub);
        padding:10px 2px 16px; border-bottom:1px solid var(--line); margin-bottom:16px;
      }
      .meta-strip strong{ color:var(--ink); font-weight:600; }
      table.items{ width:100%; border-collapse:collapse; margin-bottom:18px; font-size:12px; }
      table.items thead th{
        background:var(--accent-soft); color:var(--accent); font-weight:700; font-size:10.5px;
        letter-spacing:0.02em; text-transform:uppercase; text-align:left; padding:8px 9px;
        border:1px solid var(--line);
      }
      table.items thead th.num{ text-align:right; }
      table.items tbody td{ padding:8px 9px; border:1px solid var(--line); vertical-align:top; }
      table.items tbody td.num{ text-align:right; }
      table.items tbody td.sr{ color:var(--sub); }
      table.items tfoot td{ padding:8px 9px; border:1px solid var(--line); font-weight:700; background:#fafbfc; }
      table.items tfoot td.num{ text-align:right; }
      .totals-wrap{ display:flex; justify-content:flex-end; margin-bottom:20px; }
      table.totals{ width:300px; border-collapse:collapse; font-size:12.5px; }
      table.totals td{ padding:6px 4px; }
      table.totals td.t-label{ color:var(--sub); }
      table.totals td.t-value{ text-align:right; font-weight:600; }
      table.totals tr.grand td{ border-top:2px solid var(--ink); padding-top:10px; font-size:15px; font-weight:800; }
      table.totals tr.grand td.t-value{ color:var(--accent); }
      .hsn-summary{ margin-bottom:18px; }
      .hsn-summary .h-title{ font-size:10.5px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:var(--sub); margin-bottom:8px; }
      table.hsn{ width:100%; border-collapse:collapse; font-size:11.5px; }
      table.hsn th{ background:#fafbfc; font-weight:700; text-align:left; padding:6px 8px; border:1px solid var(--line); color:var(--sub); font-size:10.5px; }
      table.hsn th.num{ text-align:right; }
      table.hsn td{ padding:6px 8px; border:1px solid var(--line); }
      table.hsn td.num{ text-align:right; }
      .bottom-grid{ display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:8px; }
      .bank-box .b-title{ font-size:10.5px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:var(--sub); margin-bottom:8px; }
      .bank-box .b-row{ font-size:11.5px; color:var(--sub); margin-bottom:3px; }
      .bank-box .b-row strong{ color:var(--ink); }
      .sig-box{ text-align:right; }
      .sig-box .s-for{ font-size:11.5px; color:var(--sub); margin-bottom:34px; }
      .sig-box .s-line{ border-top:1px solid var(--ink); font-size:11px; color:var(--sub); padding-top:5px; display:inline-block; min-width:170px; }
      .sig-box img{ max-width:150px; max-height:60px; object-fit:contain; margin-bottom:6px; }
      .footer-note{ margin-top:22px; padding-top:14px; border-top:1px solid var(--line); font-size:10.5px; color:var(--sub); line-height:1.6; }
      @media (max-width:720px){
        .party-grid, .bottom-grid{ grid-template-columns:1fr; }
        .masthead{ flex-direction:column; gap:12px; }
        .masthead .doc-type{ text-align:left; }
        .paper{ padding:20px; }
        .sig-box{ text-align:left; }
      }
      @media print{
        body{ padding:0; background:#fff; }
        .paper{ border:0; }
      }
    </style>
  </head>
  <body>
    <div class="paper-wrap">
      <div class="paper">

        <div class="masthead">
          <div>
            <div class="brand">${escapeHtml(seller.legalBusinessName || seller.storeName || "Jenix India")}</div>
            <div class="brand-line">${sellerBrandLine}</div>
          </div>
          <div class="doc-type ${isProforma ? "proforma" : "tax"}">
            <h2>${isProforma ? "PROFORMA INVOICE" : "TAX INVOICE"}</h2>
            ${isProforma ? `<div class="proforma-note">Not a tax invoice — payment pending</div>` : ""}
            <div class="inv-no-row"><span class="label">Invoice Number:</span><span class="value">${escapeHtml(invoice.invoiceNumber || "--")}</span></div>
            <div class="inv-date-row">Invoice Date: ${escapeHtml(formatInvoiceDateLabel(invoice.invoiceDate))} &middot; Order: ${escapeHtml(invoice.orderNo || invoice.orderId || "--")}</div>
          </div>
        </div>

        <div class="party-grid">
          <div class="party-block">
            <div class="party-label">Billed To</div>
            <div class="party-name">${escapeHtml(buyer.companyName || buyer.name || "Customer")}</div>
            ${buyer.companyName && buyer.name ? `<div class="party-line">${escapeHtml(buyer.name)}</div>` : ""}
            <div class="party-line">${escapeHtml(buyerAddress || "Buyer address not available")}</div>
            <div class="party-line" style="margin-top:6px;"><strong>Mobile:</strong> ${escapeHtml(buyer.mobile || "--")} &middot; <strong>Email:</strong> ${escapeHtml(buyer.email || "--")}</div>
            ${buyer.gstin ? `<div class="party-line"><strong>GSTIN:</strong> ${escapeHtml(buyer.gstin)}</div>` : ""}
          </div>
          <div class="party-block">
            <div class="party-label">Ship To</div>
            <div class="party-name">${escapeHtml(shipping.companyName || shipping.name || buyer.companyName || buyer.name || "Customer")}</div>
            <div class="party-line">${escapeHtml(shipToAddress || buyerAddress || "Shipping address not available")}</div>
            <div class="party-line" style="margin-top:6px;"><strong>Mobile:</strong> ${escapeHtml(shipping.mobile || buyer.mobile || "--")}</div>
            ${shipping.sameAsBilling === false ? "" : `<div class="same-as-billing">Same address as Billed To.</div>`}
          </div>
        </div>

        <div class="meta-strip">
          <span>Place of Supply: <strong>${escapeHtml(joinTextParts([placeOfSupply.state, placeOfSupply.stateCode ? `(${placeOfSupply.stateCode})` : ""]) || "--")}</strong></span>
          <span>Payment: <strong>${invoice.paymentStatus === "paid" ? "Paid" : "Pending"} &mdash; ${escapeHtml(humanizePaymentMethodLabel(invoice.paymentMethod))}</strong></span>
          <span>Reverse Charge: <strong>No</strong></span>
        </div>

        <table class="items">
          <thead>
            <tr>
              <th style="width:32px;">Sr</th>
              <th>Item Description</th>
              <th style="width:78px;">HSN/SAC</th>
              <th class="num" style="width:44px;">Qty</th>
              <th class="num" style="width:96px;">Rate w/o GST</th>
              <th style="width:44px;">Per</th>
              <th class="num" style="width:96px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">Total</td>
              <td class="num">${escapeHtml(String(itemsQtyTotal))}</td>
              <td></td>
              <td></td>
              <td class="num">${escapeHtml(formatNumberInr(itemsAmountTotal))}</td>
            </tr>
          </tfoot>
        </table>

        <div class="totals-wrap">
          <table class="totals">
            <tbody>
              <tr><td class="t-label">Product Subtotal</td><td class="t-value">${escapeHtml(formatCurrencyInr(pricing.productSubtotal || 0))}</td></tr>
              ${
                display.showShippingLine !== false || Number(pricing.shippingCharge || 0) !== 0
                  ? `<tr><td class="t-label">Shipping</td><td class="t-value">${escapeHtml(formatCurrencyInr(pricing.shippingCharge || 0))}</td></tr>`
                  : ""
              }
              ${
                display.showDiscountLine !== false || Number(pricing.discountAmount || 0) !== 0
                  ? `<tr><td class="t-label">Discount</td><td class="t-value">${Number(pricing.discountAmount || 0) > 0 ? "&minus;" : ""}${escapeHtml(formatCurrencyInr(pricing.discountAmount || 0))}</td></tr>`
                  : ""
              }
              <tr><td class="t-label">Taxable Value</td><td class="t-value">${escapeHtml(formatCurrencyInr(pricing.taxableValue || 0))}</td></tr>
              ${
                placeOfSupply.isIntraState
                  ? `
                    <tr class="tax-row"><td class="t-label">CGST Total</td><td class="t-value">${escapeHtml(formatCurrencyInr(pricing.cgstTotal || 0))}</td></tr>
                    <tr class="tax-row"><td class="t-label">SGST Total</td><td class="t-value">${escapeHtml(formatCurrencyInr(pricing.sgstTotal || 0))}</td></tr>
                  `
                  : `<tr class="tax-row"><td class="t-label">IGST Total</td><td class="t-value">${escapeHtml(formatCurrencyInr(pricing.igstTotal || 0))}</td></tr>`
              }
              <tr><td class="t-label">Round Off</td><td class="t-value">${escapeHtml(formatCurrencyInr(pricing.roundOff || 0))}</td></tr>
              <tr class="grand"><td class="t-label">Grand Total</td><td class="t-value">${escapeHtml(formatCurrencyInr(pricing.grandTotal || 0))}</td></tr>
            </tbody>
          </table>
        </div>

        ${hsnSummaryHtml}
        ${customFieldsHtml}

        <div class="bottom-grid">
          ${
            display.showBankDetails !== false && bankDetails.length
              ? `
                <div class="bank-box">
                  <div class="b-title">Payment Details</div>
                  ${bankDetails.map(([label, value]) => `<div class="b-row"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`).join("")}
                </div>
              `
              : "<div></div>"
          }
          <div class="sig-box">
            ${
              display.authorizedSignatoryImageUrl
                ? `<img src="${escapeHtml(display.authorizedSignatoryImageUrl)}" alt="Authorized signatory" />`
                : ""
            }
            <div class="s-for">For ${escapeHtml(seller.legalBusinessName || seller.storeName || "Jenix India")}</div>
            <div class="s-line">Authorised Signatory</div>
          </div>
        </div>

        ${footerNote ? `<div class="footer-note">${escapeHtml(footerNote)}</div>` : ""}

      </div>
    </div>
  </body>
</html>`;
}

function resolveNextSequence(invoiceStore, invoiceSettings, financialYearLabel) {
  const startingNumber = Math.max(1, Number(invoiceSettings.invoiceStartingNumber || 1));
  let sequence = ensureArray(invoiceStore.sequences).find(
    (row) => row.financialYearLabel === financialYearLabel
  );

  if (!sequence) {
    sequence = {
      financialYearLabel,
      lastNumber: startingNumber - 1,
      updatedAt: null
    };
    invoiceStore.sequences.push(sequence);
  }

  const nextNumber = Math.max(Number(sequence.lastNumber || 0) + 1, startingNumber);
  sequence.lastNumber = nextNumber;
  sequence.updatedAt = nowIso();
  return nextNumber;
}

// Proforma numbering is a single running counter, separate from the real
// per-financial-year Tax Invoice sequence above — draft/unpaid documents must
// never consume a number from the statutory series.
function resolveNextProformaSequence(invoiceStore) {
  const nextNumber = Number(invoiceStore.proformaSequence?.lastNumber || 0) + 1;
  invoiceStore.proformaSequence = { lastNumber: nextNumber, updatedAt: nowIso() };
  return nextNumber;
}

function findOrderByIdOrNo(authStore, orderId) {
  return ensureArray(authStore.orders).find(
    (order) => order.id === orderId || order.orderNo === orderId
  );
}

function findInvoiceByOrderId(invoiceStore, orderId) {
  const matches = ensureArray(invoiceStore.invoices).filter(
    (invoice) => invoice.orderId === orderId || invoice.orderNo === orderId
  );
  if (matches.length === 0) {
    return null;
  }
  // An order can accumulate a Proforma first and a real Tax Invoice later once
  // paid — prefer the most recently generated document as "the" invoice.
  return matches.sort(
    (a, b) => Date.parse(b.generatedAt || 0) - Date.parse(a.generatedAt || 0)
  )[0];
}

function filterInvoicesByDateRange(invoices, filters) {
  const fromValue = filters.dateFrom ? Date.parse(`${filters.dateFrom}T00:00:00.000Z`) : null;
  const toValue = filters.dateTo ? Date.parse(`${filters.dateTo}T23:59:59.999Z`) : null;

  return invoices.filter((invoice) => {
    const invoiceTs = Date.parse(`${invoice.invoiceDate}T00:00:00.000Z`);
    if (Number.isNaN(invoiceTs)) {
      return false;
    }
    if (fromValue !== null && invoiceTs < fromValue) {
      return false;
    }
    if (toValue !== null && invoiceTs > toValue) {
      return false;
    }
    return true;
  });
}

async function buildInvoiceDocument(order, authStore, catalogStore, settings, invoiceStore, options) {
  const invoiceSettings = settings.invoiceSettings || {};
  const seller = resolveSellerSnapshot(settings);
  const buyer = resolveBuyerSnapshot(order, authStore);
  const shipping = resolveShippingSnapshot(order, authStore, buyer);
  const placeOfSupply = resolvePlaceOfSupply(seller, buyer);
  const productLookup = new Map(
    ensureArray(catalogStore.products).map((product) => [product.id, product])
  );
  const invoiceDateSource = options.invoiceDate
    ? `${options.invoiceDate}T00:00:00.000Z`
    : order.paymentVerifiedAt || order.createdAt || nowIso();
  const invoiceDate = formatDateOnly(invoiceDateSource);
  const financialYearLabel = resolveFinancialYearLabel(
    invoiceDateSource,
    invoiceSettings.financialYearFormat
  );

  // A real Tax Invoice number is only ever assigned once payment is confirmed —
  // an unpaid order gets a Proforma Invoice instead, drawn from its own separate
  // numbering series so the statutory Tax Invoice sequence stays gap-free.
  const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
  const documentType = isPaid ? "tax_invoice" : "proforma_invoice";
  let sequenceNumber;
  let invoiceNumber;
  if (isPaid) {
    sequenceNumber = resolveNextSequence(invoiceStore, invoiceSettings, financialYearLabel);
    invoiceNumber = buildInvoiceNumber(invoiceSettings, financialYearLabel, sequenceNumber);
  } else {
    sequenceNumber = resolveNextProformaSequence(invoiceStore);
    invoiceNumber = buildProformaInvoiceNumber(sequenceNumber);
  }
  const items = ensureArray(order.items).map((item) =>
    buildOrderItemSnapshot(item, productLookup, placeOfSupply)
  );

  // Shipping charges are taxed too (see cart-checkout.service.js calculatePricing) —
  // that amount isn't tied to any single line item's HSN code, so it isn't part of
  // buildHsnSummary, but it must still land in the same CGST/SGST/IGST split those
  // totals feed into or the invoice's tax total won't reconcile with its own lines.
  const shippingGstAmount = Number(order.shippingGstAmount || 0);
  const shippingTaxSplit = splitTaxAmounts(0, shippingGstAmount, placeOfSupply.isIntraState);

  const cgstTotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.cgstAmount || 0), 0) + shippingTaxSplit.cgstAmount
  );
  const sgstTotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.sgstAmount || 0), 0) + shippingTaxSplit.sgstAmount
  );
  const igstTotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.igstAmount || 0), 0) + shippingTaxSplit.igstAmount
  );
  const invoiceId = generateId("invoice");
  const generatedAt = nowIso();

  return {
    id: invoiceId,
    orderId: order.id,
    orderNo: order.orderNo || "",
    checkoutSessionId: order.checkoutSessionId || null,
    invoiceNumber,
    documentType,
    invoiceDate,
    financialYearLabel,
    sequenceNumber,
    paymentStatus: order.paymentStatus || "",
    paymentMethod: order.paymentMethod || "",
    gatewayTxnId: order.gatewayTxnId || "",
    generatedAt,
    generatedBy: options.actor?.id || "system",
    generatedByRole: options.actor?.role || "system",
    generationSource: options.source || "system",
    lockedAt: generatedAt,
    isLocked: true,
    seller,
    buyer,
    shipping,
    placeOfSupply,
    display: {
      logoUrl: seller.logoUrl,
      footer: invoiceSettings.invoiceFooter || "",
      terms: invoiceSettings.invoiceTerms || "",
      authorizedSignatoryImageUrl: invoiceSettings.authorizedSignatoryImageUrl || "",
      showBankDetails: invoiceSettings.showBankDetails !== false,
      showHsnSummary: invoiceSettings.showHsnSummary !== false,
      showShippingLine: invoiceSettings.showShippingLine !== false,
      showDiscountLine: invoiceSettings.showDiscountLine !== false,
      customInvoiceFields: ensureArray(invoiceSettings.customInvoiceFields).map((field) => ({
        label: field.label,
        value: field.value
      }))
    },
    items,
    hsnSummary: buildHsnSummary(items),
    pricing: {
      productSubtotal: Number(order.productSubtotal || 0),
      discountAmount: Number(order.discountAmount || 0),
      taxableValue: Number(order.taxableValue || 0),
      gstTotal: Number(order.gstTotal || 0),
      cgstTotal,
      sgstTotal,
      igstTotal,
      shippingCharge: Number(order.shippingCharge || 0),
      shippingGstAmount,
      roundOff: Number(order.roundOff || 0),
      grandTotal: Number(order.grandTotal || 0),
      amountInWords: amountToWords(order.grandTotal)
    }
  };
}

async function ensureInvoiceForOrder(orderId, actor = null, options = {}) {
  const [authStore, catalogStore, invoiceStore, settings] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readInvoiceStore(),
    jsonFileStore.readSettingsDocument()
  ]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);

  const order = findOrderByIdOrNo(authStore, orderId);
  if (!order) {
    throw new HttpError(404, "Order not found for invoice generation.");
  }
  if (String(order.orderStatus || "").toLowerCase() === "cancelled") {
    throw new HttpError(409, "Invoice cannot be generated for a cancelled order.");
  }

  const isPaid = String(order.paymentStatus || "").toLowerCase() === "paid";

  // A Proforma generated while unpaid must not be handed back once the order is
  // paid — that case falls through so a real Tax Invoice gets built below instead.
  if (order.invoiceId) {
    const existingById = ensureArray(invoiceStore.invoices).find(
      (invoice) => invoice.id === order.invoiceId
    );
    if (existingById && !(isPaid && existingById.documentType === "proforma_invoice")) {
      return {
        created: false,
        invoice: sanitizeInvoice(existingById)
      };
    }
  }

  const existingByOrder = findInvoiceByOrderId(invoiceStore, order.id);
  if (existingByOrder && !(isPaid && existingByOrder.documentType === "proforma_invoice")) {
    order.invoiceId = existingByOrder.id;
    order.invoiceNumber = existingByOrder.invoiceNumber;
    order.invoiceGeneratedAt = existingByOrder.generatedAt;
    await writeAuthStore(authStore);
    return {
      created: false,
      invoice: sanitizeInvoice(existingByOrder)
    };
  }

  const invoice = await buildInvoiceDocument(order, authStore, catalogStore, settings, invoiceStore, {
    actor,
    source: options.source,
    invoiceDate: options.invoiceDate
  });

  invoiceStore.invoices.push(invoice);
  order.invoiceId = invoice.id;
  order.invoiceNumber = invoice.invoiceNumber;
  order.invoiceGeneratedAt = invoice.generatedAt;

  await Promise.all([writeAuthStore(authStore), writeInvoiceStore(invoiceStore)]);

  await addActivityLog({
    action: "invoice.generated",
    actorId: actor?.id || "system",
    actorRole: actor?.role || "system",
    resourceType: "invoice",
    resourceId: invoice.id,
    metadata: {
      orderId: order.id,
      invoiceNumber: invoice.invoiceNumber,
      documentType: invoice.documentType,
      source: options.source || "system"
    }
  });

  return {
    created: true,
    invoice: sanitizeInvoice(invoice)
  };
}

async function listInvoices(filters = {}) {
  const invoiceStore = await readInvoiceStore();
  ensureInvoiceStoreShape(invoiceStore);

  let invoices = ensureArray(invoiceStore.invoices);
  if (filters.orderId) {
    invoices = invoices.filter(
      (invoice) =>
        invoice.orderId === filters.orderId || invoice.orderNo === filters.orderId
    );
  }
  invoices = filterInvoicesByDateRange(invoices, filters);

  invoices = invoices
    .sort((a, b) => {
      const aTs = Date.parse(a.generatedAt || a.invoiceDate || "");
      const bTs = Date.parse(b.generatedAt || b.invoiceDate || "");
      return bTs - aTs;
    })
    .slice(0, Number(filters.limit || 100));

  return invoices.map(sanitizeInvoiceSummary);
}

async function getInvoiceById(invoiceId) {
  const invoiceStore = await readInvoiceStore();
  ensureInvoiceStoreShape(invoiceStore);

  const invoice = ensureArray(invoiceStore.invoices).find((row) => row.id === invoiceId);
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }

  return sanitizeInvoice(invoice);
}

// Corrects a buyer's identity/contact details (name, company, GSTIN, email,
// mobile, address line/city/pincode) on an ALREADY-ISSUED invoice — e.g. a
// buyer forgot to enter their GSTIN at checkout. Deliberately does not touch
// state/stateCode/country, invoiceNumber, or any pricing/GST field: those
// were already charged and require a credit note to change properly, not an
// in-place edit. The order's billingAddress is the source of truth — this
// patches it, then re-derives the invoice's stored buyer snapshot from it,
// so both stay consistent for any future re-render.
const CORRECTABLE_BUYER_FIELDS = [
  "companyName",
  "name",
  "gstin",
  "email",
  "mobile",
  "addressLine1",
  "addressLine2",
  "city",
  "pincode"
];

async function correctInvoiceBuyerDetails(invoiceId, patch, actor) {
  const [authStore, invoiceStore] = await Promise.all([readAuthStore(), readInvoiceStore()]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);

  const invoiceIdx = ensureArray(invoiceStore.invoices).findIndex((row) => row.id === invoiceId);
  if (invoiceIdx === -1) {
    throw new HttpError(404, "Invoice not found.");
  }
  const invoice = invoiceStore.invoices[invoiceIdx];

  const order = ensureArray(authStore.orders).find((row) => row.id === invoice.orderId);
  if (!order) {
    throw new HttpError(404, "Order not found for this invoice.");
  }

  const changedFields = CORRECTABLE_BUYER_FIELDS.filter((key) => patch[key] !== undefined);
  if (changedFields.length === 0) {
    throw new HttpError(400, "No buyer fields to update.");
  }

  const before = { ...invoice.buyer };

  order.billingAddress = { ...(order.billingAddress || {}) };
  for (const key of changedFields) {
    order.billingAddress[key] = patch[key];
  }
  order.updatedAt = nowIso();

  const updatedBuyer = resolveBuyerSnapshot(order, authStore);
  invoice.buyer = updatedBuyer;
  invoice.correctionHistory = ensureArray(invoice.correctionHistory);
  invoice.correctionHistory.push({
    correctedAt: nowIso(),
    correctedBy: actor?.id || "admin",
    fieldsChanged: changedFields,
    reason: patch.reason || ""
  });
  invoiceStore.invoices[invoiceIdx] = invoice;

  await Promise.all([writeAuthStore(authStore), writeInvoiceStore(invoiceStore)]);

  await addActivityLog({
    action: "invoice.buyer_corrected",
    actorId: actor?.id,
    actorRole: actor?.role,
    resourceType: "invoice",
    resourceId: invoiceId,
    metadata: { before, after: updatedBuyer, fieldsChanged: changedFields }
  });

  return sanitizeInvoice(invoice);
}

async function getInvoiceForOrder(orderId) {
  const invoiceStore = await readInvoiceStore();
  ensureInvoiceStoreShape(invoiceStore);

  const invoice = findInvoiceByOrderId(invoiceStore, orderId);
  if (!invoice) {
    throw new HttpError(404, "Invoice not found for order.");
  }

  return sanitizeInvoice(invoice);
}

async function generateInvoice(orderId, payload, actor) {
  return ensureInvoiceForOrder(orderId, actor, {
    source: "admin_manual_generate",
    invoiceDate: payload.invoiceDate
  });
}

async function getInvoiceDownload(invoiceId) {
  const invoice = await getInvoiceById(invoiceId);
  const safeBaseName = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return {
    fileName: `${safeBaseName}.html`,
    format: "html",
    contentType: "text/html;charset=utf-8",
    content: renderInvoiceHtml(invoice),
    invoiceNumber: invoice.invoiceNumber
  };
}

module.exports = {
  ensureInvoiceForOrder,
  listInvoices,
  getInvoiceById,
  getInvoiceForOrder,
  generateInvoice,
  getInvoiceDownload,
  correctInvoiceBuyerDetails,
  filterInvoicesByDateRange
};
