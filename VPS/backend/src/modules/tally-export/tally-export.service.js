const { generateId } = require("../../common/identity");
const { HttpError } = require("../../common/http-error");
const { readInvoiceStore, writeInvoiceStore } = require("../../database/invoice-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  ensureArray,
  ensureInvoiceStoreShape,
  roundMoney
} = require("../invoices/invoices.model");
const { filterInvoicesByDateRange } = require("../invoices/invoices.service");
const { sanitizeTallyExportLog } = require("./tally-export.model");
const { SHIPPING_TAX } = require("../cart-checkout/cart-checkout.model");

function nowIso() {
  return new Date().toISOString();
}

function resolvePeriodKey(invoice, period) {
  const [year, month] = String(invoice.invoiceDate || "").split("-");
  if (period === "yearly") {
    return year || "";
  }
  return year && month ? `${year}-${month}` : "";
}

function escapeCsvValue(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

// Tally's voucher/invoice number field is capped at 16 characters and
// rejects punctuation -- the real GST invoice number ("JNX/2026-27/000004")
// is neither. This derives a short alphanumeric-only key from it for the
// import; the full legal number still travels in OriginalInvoiceNumber so
// the accountant can match a Tally voucher back to the actual invoice PDF.
function toTallyVoucherNo(invoiceNumber) {
  return String(invoiceNumber || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16);
}

const CSV_HEADERS = [
  "VoucherDate",
  "InvoiceNumber",
  "OriginalInvoiceNumber",
  "OrderNumber",
  "PartyName",
  "PartyGSTIN",
  "PlaceOfSupply",
  "ProductName",
  "HSNCode",
  "Qty",
  "UnitRate",
  "TaxableValue",
  "CGST",
  "SGST",
  "IGST",
  "LineTotal",
  "DiscountAmount",
  "ShippingCharge",
  "ShippingGST",
  "RoundOff",
  "GrandTotal",
  "PaymentStatus",
  "PeriodKey"
];

function buildCsv(rows) {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.voucherDate,
        row.invoiceNumber,
        row.originalInvoiceNumber,
        row.orderNumber,
        row.partyName,
        row.partyGstin,
        row.placeOfSupply,
        row.productName,
        row.hsnCode,
        row.qty,
        row.unitRate,
        row.taxableValue,
        row.cgstTotal,
        row.sgstTotal,
        row.igstTotal,
        row.lineTotal,
        row.discountAmount,
        row.shippingCharge,
        row.shippingGst,
        row.roundOff,
        row.grandTotal,
        row.paymentStatus,
        row.periodKey
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  }

  return lines.join("\n");
}

// One row per product line -- since 2026-09, shipping is generated as a real
// item on the invoice itself (HSN 996812, see invoices.service.js's
// buildShippingItemSnapshot), so it already comes through naturally here
// like any other line, with its own qty/rate/taxable/tax. Invoices from
// before that change never got a shipping item, so this still synthesizes a
// fallback "Shipping Charges" row for those from the invoice's aggregate
// pricing fields, purely for backward compatibility with older data.
// Invoice-level figures that only exist once per invoice (discount,
// shipping, round-off, grand total) are placed ONLY on the last row (the
// shipping line, real or synthesized), never repeated across product lines,
// so summing any column down the whole sheet gives the correct total
// instead of double-counting.
function buildInvoiceLineRows(invoice, periodKey) {
  const pricing = invoice.pricing || {};
  const base = {
    voucherDate: invoice.invoiceDate,
    invoiceNumber: toTallyVoucherNo(invoice.invoiceNumber),
    originalInvoiceNumber: invoice.invoiceNumber,
    orderNumber: invoice.orderNo || "",
    partyName: invoice.buyer?.companyName || invoice.buyer?.name || "Customer",
    partyGstin: invoice.buyer?.gstin || "",
    placeOfSupply: invoice.placeOfSupply?.stateCode || "",
    paymentStatus: invoice.paymentStatus || "",
    periodKey
  };

  const invoiceItems = ensureArray(invoice.items);
  const hasShippingItem = invoiceItems.some((item) => item.hsnCode === SHIPPING_TAX.HSN_CODE);

  const itemRows = invoiceItems.map((item) => {
    const qty = Number(item.qty || 0);
    const taxableValue = Number(item.taxableValue || 0);
    return {
      ...base,
      productName: item.title || "",
      hsnCode: item.hsnCode || "",
      qty,
      unitRate: qty > 0 ? roundMoney(taxableValue / qty) : 0,
      taxableValue,
      cgstTotal: Number(item.cgstAmount || 0),
      sgstTotal: Number(item.sgstAmount || 0),
      igstTotal: Number(item.igstAmount || 0),
      lineTotal: Number(item.lineTotal || 0),
      discountAmount: "",
      shippingCharge: item.hsnCode === SHIPPING_TAX.HSN_CODE ? taxableValue : "",
      shippingGst: item.hsnCode === SHIPPING_TAX.HSN_CODE ? Number(item.gstAmount || 0) : "",
      roundOff: "",
      grandTotal: ""
    };
  });

  const rows = hasShippingItem
    ? itemRows
    : [
        ...itemRows,
        {
          ...base,
          productName: "Shipping Charges",
          hsnCode: "",
          qty: Number(pricing.shippingCharge || 0) > 0 ? 1 : 0,
          unitRate: Number(pricing.shippingCharge || 0),
          taxableValue: Number(pricing.shippingCharge || 0),
          cgstTotal: roundMoney(Number(pricing.cgstTotal || 0) - itemRows.reduce((s, r) => s + Number(r.cgstTotal || 0), 0)),
          sgstTotal: roundMoney(Number(pricing.sgstTotal || 0) - itemRows.reduce((s, r) => s + Number(r.sgstTotal || 0), 0)),
          igstTotal: roundMoney(Number(pricing.igstTotal || 0) - itemRows.reduce((s, r) => s + Number(r.igstTotal || 0), 0)),
          lineTotal: roundMoney(Number(pricing.shippingCharge || 0) + Number(pricing.shippingGstAmount || 0)),
          discountAmount: "",
          shippingCharge: Number(pricing.shippingCharge || 0),
          shippingGst: Number(pricing.shippingGstAmount || 0),
          roundOff: "",
          grandTotal: ""
        }
      ];

  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    lastRow.discountAmount = Number(pricing.discountAmount || 0);
    lastRow.roundOff = Number(pricing.roundOff || 0);
    lastRow.grandTotal = Number(pricing.grandTotal || 0);
  }

  return rows;
}

async function exportInvoicesAsTallyCsv(filters, actor) {
  const invoiceStore = await readInvoiceStore();
  ensureInvoiceStoreShape(invoiceStore);

  let invoices = ensureArray(invoiceStore.invoices);
  // Proforma Invoices are unpaid drafts, not confirmed sales — Tally's books must
  // only ever see the real Tax Invoice once one exists for the order.
  invoices = invoices.filter((invoice) => invoice.documentType !== "proforma_invoice");
  invoices = filterInvoicesByDateRange(invoices, filters).sort((a, b) =>
    String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || ""))
  );

  const rows = invoices.flatMap((invoice) =>
    buildInvoiceLineRows(invoice, resolvePeriodKey(invoice, filters.period))
  );

  // Every invoice-level figure (discount, shipping, round-off, grand total)
  // appears on exactly one row per invoice (the shipping row) -- summing
  // across every flattened row therefore still gives the correct total,
  // with no double-counting from the repeated per-invoice header fields.
  const totals = rows.reduce(
    (summary, row) => ({
      taxableValue: roundMoney(summary.taxableValue + Number(row.taxableValue || 0)),
      cgstTotal: roundMoney(summary.cgstTotal + Number(row.cgstTotal || 0)),
      sgstTotal: roundMoney(summary.sgstTotal + Number(row.sgstTotal || 0)),
      igstTotal: roundMoney(summary.igstTotal + Number(row.igstTotal || 0)),
      discountAmount: roundMoney(summary.discountAmount + Number(row.discountAmount || 0)),
      shippingCharge: roundMoney(summary.shippingCharge + Number(row.shippingCharge || 0)),
      roundOff: roundMoney(summary.roundOff + Number(row.roundOff || 0)),
      grandTotal: roundMoney(summary.grandTotal + Number(row.grandTotal || 0))
    }),
    {
      taxableValue: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      discountAmount: 0,
      shippingCharge: 0,
      roundOff: 0,
      grandTotal: 0
    }
  );

  const fileName = `tally-export-${filters.period}-${filters.dateFrom || "all"}-${filters.dateTo || "all"}.csv`;
  const csv = buildCsv(rows);

  const exportEntry = {
    id: generateId("tally_export"),
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
    period: filters.period,
    rowCount: invoices.length,
    generatedAt: nowIso(),
    generatedBy: actor?.id || "system",
    totalGrandTotal: totals.grandTotal,
    fileName,
    // The CSV is frozen at generation time -- once handed to the accountant,
    // it must not silently change if invoice data is corrected/edited later.
    // A past export is a fixed record of "what we sent them", not a live view.
    csv
  };
  invoiceStore.tallyExports.push(exportEntry);
  await writeInvoiceStore(invoiceStore);

  await addActivityLog({
    action: "tally_export.generated",
    actorId: actor?.id || "system",
    actorRole: actor?.role || "system",
    resourceType: "tally_export",
    resourceId: exportEntry.id,
    metadata: {
      rowCount: invoices.length,
      period: filters.period
    }
  });

  return {
    exportId: exportEntry.id,
    format: "csv",
    xmlReady: false,
    period: filters.period,
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
    rowCount: invoices.length,
    totals,
    fileName,
    rows,
    csv
  };
}

async function listTallyExportHistory() {
  const invoiceStore = await readInvoiceStore();
  ensureInvoiceStoreShape(invoiceStore);

  return ensureArray(invoiceStore.tallyExports)
    .slice()
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))
    .map(sanitizeTallyExportLog);
}

async function getTallyExportDownload(exportId) {
  const invoiceStore = await readInvoiceStore();
  ensureInvoiceStoreShape(invoiceStore);

  const entry = ensureArray(invoiceStore.tallyExports).find((row) => row.id === exportId);
  if (!entry) {
    throw new HttpError(404, "Tally export not found.");
  }
  if (!entry.csv) {
    throw new HttpError(410, "This export predates saved downloads — regenerate it to get a downloadable copy.");
  }

  return {
    fileName: entry.fileName || `tally-export-${entry.id}.csv`,
    csv: entry.csv
  };
}

module.exports = { exportInvoicesAsTallyCsv, listTallyExportHistory, getTallyExportDownload };
