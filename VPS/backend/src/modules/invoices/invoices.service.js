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
  const sellerAddress = joinTextParts([
    seller.address,
    seller.pickupAddress,
    seller.state
  ]);
  const sellerContact = joinTextParts([
    seller.supportMobile,
    seller.supportEmail,
    seller.whatsappNumber ? `WhatsApp: ${seller.whatsappNumber}` : ""
  ]);
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
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(item.title || "Item")}</strong>
            <div class="subtext">${escapeHtml(item.sku || item.productId || "--")}</div>
          </td>
          <td>${escapeHtml(item.hsnCode || "--")}</td>
          <td>${escapeHtml(String(qty))}</td>
          <td>${escapeHtml(formatCurrencyInr(rateWithoutGst))}</td>
          <td>Nos</td>
          <td>${escapeHtml(formatCurrencyInr(item.taxableValue || 0))}</td>
        </tr>
      `;
    })
    .join("");
  const hsnSummaryHtml =
    display.showHsnSummary !== false && ensureArray(invoice.hsnSummary).length
      ? `
        <section class="panel">
          <h3>HSN Summary</h3>
          <table>
            <thead>
              <tr>
                <th>HSN</th>
                <th>GST Rate</th>
                <th>Taxable Value</th>
                <th>Tax Amount</th>
                <th>Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${ensureArray(invoice.hsnSummary)
                .map(
                  (row) => `
                    <tr>
                      <td>${escapeHtml(row.hsnCode || "--")}</td>
                      <td>${escapeHtml(formatPercent(row.gstRate || 0))}</td>
                      <td>${escapeHtml(formatCurrencyInr(row.taxableValue || 0))}</td>
                      <td>${escapeHtml(formatCurrencyInr(row.totalTaxAmount || 0))}</td>
                      <td>${escapeHtml(formatCurrencyInr(row.lineTotal || 0))}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>
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
    bankDetails.push(["Account Number", seller.accountNumber]);
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
      <section class="panel">
        <h3>Additional Details</h3>
        <div class="meta-grid">
          ${renderInfoPairs(customFields.map((field) => [field.label, field.value]))}
        </div>
      </section>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(invoice.invoiceNumber || "Invoice")}</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 24px;
        background: #f3f4f6;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
      }
      .invoice-shell {
        max-width: 1040px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #d1d5db;
        padding: 32px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        border-bottom: 2px solid #111827;
        padding-bottom: 20px;
        margin-bottom: 24px;
      }
      .brand-row {
        display: flex;
        gap: 18px;
        align-items: flex-start;
      }
      .brand-logo {
        width: 72px;
        max-height: 72px;
        object-fit: contain;
      }
      .brand h1 {
        margin: 0;
        font-size: 28px;
      }
      .brand p,
      .subtext,
      .meta-label,
      .block p,
      .footer-note {
        color: #4b5563;
      }
      .brand p,
      .block p,
      .footer-note {
        margin: 6px 0 0;
        line-height: 1.5;
      }
      .header-side {
        min-width: 280px;
        text-align: right;
      }
      .header-side h2 {
        margin: 0;
        font-size: 24px;
      }
      .header-side p {
        margin: 8px 0 0;
      }
      .doc-title-proforma {
        color: #b45309;
      }
      .doc-note {
        display: inline-block;
        margin-top: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: #fef3e0;
        color: #b45309;
        border: 1px solid #f3d9ad;
        padding: 3px 8px;
      }
      .meta-grid,
      .party-grid,
      .totals-grid {
        display: grid;
        gap: 16px;
      }
      .meta-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin-bottom: 24px;
      }
      .party-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-bottom: 24px;
      }
      .meta-card,
      .block,
      .panel,
      .totals-card {
        border: 1px solid #d1d5db;
        padding: 14px 16px;
        background: #ffffff;
      }
      .meta-label {
        display: block;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 8px;
      }
      .block h3,
      .panel h3,
      .totals-card h3 {
        margin: 0 0 12px;
        font-size: 16px;
      }
      .panel {
        margin-top: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      th,
      td {
        border: 1px solid #d1d5db;
        padding: 10px;
        text-align: left;
        vertical-align: top;
        font-size: 14px;
      }
      th {
        background: #f9fafb;
      }
      td strong {
        display: block;
      }
      tfoot td {
        font-weight: 700;
        background: #f9fafb;
      }
      .subtext {
        font-size: 11px;
        color: #6b7280;
        font-style: italic;
        margin: 4px 0 0;
      }
      .totals-grid {
        grid-template-columns: 1.4fr 1fr;
        margin-top: 20px;
      }
      .totals-table td:first-child {
        width: 64%;
      }
      .grand-total td {
        font-size: 16px;
        font-weight: 700;
      }
      .signature {
        margin-top: 24px;
        display: flex;
        justify-content: space-between;
        gap: 20px;
      }
      .signature-box {
        width: 280px;
        text-align: center;
      }
      .signature-box img {
        max-width: 180px;
        max-height: 80px;
        object-fit: contain;
        margin-bottom: 10px;
      }
      .print-note {
        margin-top: 24px;
        font-size: 12px;
        color: #6b7280;
      }
      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }
        .invoice-shell {
          border: 0;
          max-width: none;
        }
      }
      @media (max-width: 840px) {
        body {
          padding: 0;
        }
        .invoice-shell {
          border: 0;
          padding: 18px;
        }
        .header,
        .signature {
          flex-direction: column;
        }
        .header-side {
          text-align: left;
          min-width: 0;
        }
        .meta-grid,
        .party-grid,
        .totals-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="invoice-shell">
      <section class="header">
        <div class="brand-row">
          ${
            seller.logoUrl
              ? `<img class="brand-logo" src="${escapeHtml(seller.logoUrl)}" alt="Logo" />`
              : ""
          }
          <div class="brand">
            <h1>${escapeHtml(seller.legalBusinessName || seller.storeName || "Jenix India")}</h1>
            <p>${escapeHtml(seller.storeName || "Jenix India")}</p>
            <p>${escapeHtml(sellerAddress || "Seller address not configured")}</p>
            <p>${escapeHtml(sellerContact || "Seller contact details not configured")}</p>
            <p>GSTIN: ${escapeHtml(seller.gstin || "--")}</p>
          </div>
        </div>
        <div class="header-side">
          <h2 class="${isProforma ? "doc-title-proforma" : ""}">${isProforma ? "Proforma Invoice" : "Tax Invoice"}</h2>
          ${isProforma ? `<span class="doc-note">Not a tax invoice — payment pending</span>` : ""}
          <p>Invoice Number: <strong>${escapeHtml(invoice.invoiceNumber || "--")}</strong></p>
          <p>Generated on ${escapeHtml(formatInvoiceDateLabel(invoice.generatedAt || invoice.invoiceDate))}</p>
        </div>
      </section>

      <section class="meta-grid">
        ${renderInfoPairs([
          ["Invoice Date", formatInvoiceDateLabel(invoice.invoiceDate)],
          ["Order Number", invoice.orderNo || invoice.orderId || "--"],
          ["Payment Status", invoice.paymentStatus || "--"],
          ["Payment Method", invoice.paymentMethod || "--"],
          ["Transaction ID", invoice.gatewayTxnId || "--"],
          [
            "Place of Supply",
            joinTextParts([
              placeOfSupply.state,
              placeOfSupply.stateCode ? `Code ${placeOfSupply.stateCode}` : ""
            ]) || "--"
          ],
          ["Financial Year", invoice.financialYearLabel || "--"],
          ["Amount in Words", pricing.amountInWords || "--"]
        ])}
      </section>

      <section class="party-grid">
        <article class="block">
          <h3>Billed To</h3>
          <p><strong>${escapeHtml(buyer.companyName || buyer.name || "Customer")}</strong></p>
          <p>${escapeHtml(buyer.name || "--")}</p>
          <p>${escapeHtml(buyerAddress || "Buyer address not available")}</p>
          <p>Email: ${escapeHtml(buyer.email || "--")}</p>
          <p>Mobile: ${escapeHtml(buyer.mobile || "--")}</p>
          <p>GSTIN: ${escapeHtml(buyer.gstin || "--")}</p>
        </article>
        <article class="block">
          <h3>Ship To</h3>
          <p><strong>${escapeHtml(shipping.companyName || shipping.name || buyer.companyName || buyer.name || "Customer")}</strong></p>
          <p>${escapeHtml(shipToAddress || buyerAddress || "Shipping address not available")}</p>
          <p>Mobile: ${escapeHtml(shipping.mobile || buyer.mobile || "--")}</p>
          ${shipping.sameAsBilling === false ? "" : `<p class="subtext">Same address as Billed To.</p>`}
        </article>
      </section>

      <section class="panel">
        <h3>Invoice Items</h3>
        <table>
          <thead>
            <tr>
              <th>Sr No.</th>
              <th>Item Description</th>
              <th>HSN/SAC</th>
              <th>Qty</th>
              <th>Rate w/o GST</th>
              <th>Per</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr class="items-total">
              <td colspan="3">Total</td>
              <td>${escapeHtml(String(itemsQtyTotal))}</td>
              <td></td>
              <td></td>
              <td>${escapeHtml(formatCurrencyInr(itemsAmountTotal))}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      ${hsnSummaryHtml}
      ${customFieldsHtml}

      <section class="totals-grid">
        <article class="totals-card">
          <h3>Terms and Notes</h3>
          <p>${escapeHtml(display.terms || "Goods once sold will not be taken back unless approved under store policy.")}</p>
          <p>${escapeHtml(display.footer || "This is a system-generated invoice.")}</p>
        </article>
        <article class="totals-card">
          <h3>Totals</h3>
          <table class="totals-table">
            <tbody>
              <tr>
                <td>Product Subtotal</td>
                <td>${escapeHtml(formatCurrencyInr(pricing.productSubtotal || 0))}</td>
              </tr>
              ${
                display.showShippingLine !== false || Number(pricing.shippingCharge || 0) !== 0
                  ? `
                    <tr>
                      <td>Shipping</td>
                      <td>${escapeHtml(formatCurrencyInr(pricing.shippingCharge || 0))}</td>
                    </tr>
                  `
                  : ""
              }
              ${
                display.showDiscountLine !== false || Number(pricing.discountAmount || 0) !== 0
                  ? `
                    <tr>
                      <td>Discount</td>
                      <td>${escapeHtml(formatCurrencyInr(pricing.discountAmount || 0))}</td>
                    </tr>
                  `
                  : ""
              }
              <tr>
                <td>Taxable Value</td>
                <td>${escapeHtml(formatCurrencyInr(pricing.taxableValue || 0))}</td>
              </tr>
              ${
                placeOfSupply.isIntraState
                  ? `
                    <tr>
                      <td>CGST Total</td>
                      <td>${escapeHtml(formatCurrencyInr(pricing.cgstTotal || 0))}</td>
                    </tr>
                    <tr>
                      <td>SGST Total</td>
                      <td>${escapeHtml(formatCurrencyInr(pricing.sgstTotal || 0))}</td>
                    </tr>
                  `
                  : `
                    <tr>
                      <td>IGST Total</td>
                      <td>${escapeHtml(formatCurrencyInr(pricing.igstTotal || 0))}</td>
                    </tr>
                  `
              }
              <tr>
                <td>Round Off</td>
                <td>${escapeHtml(formatCurrencyInr(pricing.roundOff || 0))}</td>
              </tr>
              <tr class="grand-total">
                <td>Grand Total</td>
                <td>${escapeHtml(formatCurrencyInr(pricing.grandTotal || 0))}</td>
              </tr>
            </tbody>
          </table>
        </article>
      </section>

      ${
        display.showBankDetails !== false && bankDetails.length
          ? `
            <section class="panel">
              <h3>Bank / Payment Details</h3>
              <div class="meta-grid">
                ${renderInfoPairs(bankDetails)}
              </div>
            </section>
          `
          : ""
      }

      <section class="signature">
        <div class="footer-note">
          <p>This invoice was generated for GST compliance and order fulfilment records.</p>
          <p>Please keep this document for warranty, tax, and transport reference where applicable.</p>
        </div>
        <div class="signature-box">
          ${
            display.authorizedSignatoryImageUrl
              ? `<img src="${escapeHtml(display.authorizedSignatoryImageUrl)}" alt="Authorized signatory" />`
              : ""
          }
          <strong>Authorized Signatory</strong>
          <p>${escapeHtml(seller.legalBusinessName || seller.storeName || "Jenix India")}</p>
        </div>
      </section>

      <p class="print-note">Printable HTML invoice generated by the Jenix admin system.</p>
    </main>
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
  filterInvoicesByDateRange
};
