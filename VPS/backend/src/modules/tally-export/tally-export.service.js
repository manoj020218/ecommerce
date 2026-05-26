const { generateId } = require("../../common/identity");
const { readInvoiceStore, writeInvoiceStore } = require("../../database/invoice-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  ensureArray,
  ensureInvoiceStoreShape,
  roundMoney
} = require("../invoices/invoices.model");
const { filterInvoicesByDateRange } = require("../invoices/invoices.service");

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

function buildCsv(rows) {
  const headers = [
    "VoucherDate",
    "InvoiceNumber",
    "OrderNumber",
    "PartyName",
    "PartyGSTIN",
    "PlaceOfSupply",
    "TaxableValue",
    "CGST",
    "SGST",
    "IGST",
    "ShippingCharge",
    "RoundOff",
    "GrandTotal",
    "PaymentStatus",
    "PeriodKey"
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.voucherDate,
        row.invoiceNumber,
        row.orderNumber,
        row.partyName,
        row.partyGstin,
        row.placeOfSupply,
        row.taxableValue,
        row.cgstTotal,
        row.sgstTotal,
        row.igstTotal,
        row.shippingCharge,
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

async function exportInvoicesAsTallyCsv(filters, actor) {
  const invoiceStore = await readInvoiceStore();
  ensureInvoiceStoreShape(invoiceStore);

  let invoices = ensureArray(invoiceStore.invoices);
  invoices = filterInvoicesByDateRange(invoices, filters).sort((a, b) =>
    String(a.invoiceDate || "").localeCompare(String(b.invoiceDate || ""))
  );

  const rows = invoices.map((invoice) => ({
    voucherDate: invoice.invoiceDate,
    invoiceNumber: invoice.invoiceNumber,
    orderNumber: invoice.orderNo || "",
    partyName: invoice.buyer?.companyName || invoice.buyer?.name || "Customer",
    partyGstin: invoice.buyer?.gstin || "",
    placeOfSupply: invoice.placeOfSupply?.stateCode || "",
    taxableValue: Number(invoice.pricing?.taxableValue || 0),
    cgstTotal: Number(invoice.pricing?.cgstTotal || 0),
    sgstTotal: Number(invoice.pricing?.sgstTotal || 0),
    igstTotal: Number(invoice.pricing?.igstTotal || 0),
    shippingCharge: Number(invoice.pricing?.shippingCharge || 0),
    roundOff: Number(invoice.pricing?.roundOff || 0),
    grandTotal: Number(invoice.pricing?.grandTotal || 0),
    paymentStatus: invoice.paymentStatus || "",
    periodKey: resolvePeriodKey(invoice, filters.period)
  }));

  const totals = rows.reduce(
    (summary, row) => ({
      taxableValue: roundMoney(summary.taxableValue + row.taxableValue),
      cgstTotal: roundMoney(summary.cgstTotal + row.cgstTotal),
      sgstTotal: roundMoney(summary.sgstTotal + row.sgstTotal),
      igstTotal: roundMoney(summary.igstTotal + row.igstTotal),
      shippingCharge: roundMoney(summary.shippingCharge + row.shippingCharge),
      roundOff: roundMoney(summary.roundOff + row.roundOff),
      grandTotal: roundMoney(summary.grandTotal + row.grandTotal)
    }),
    {
      taxableValue: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      shippingCharge: 0,
      roundOff: 0,
      grandTotal: 0
    }
  );

  const exportEntry = {
    id: generateId("tally_export"),
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
    period: filters.period,
    rowCount: rows.length,
    generatedAt: nowIso(),
    generatedBy: actor?.id || "system",
    totalGrandTotal: totals.grandTotal
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
      rowCount: rows.length,
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
    rowCount: rows.length,
    totals,
    fileName: `tally-export-${filters.period}-${filters.dateFrom || "all"}-${filters.dateTo || "all"}.csv`,
    rows,
    csv: buildCsv(rows)
  };
}

module.exports = { exportInvoicesAsTallyCsv };
