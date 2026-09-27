const FINANCIAL_YEAR_FORMATS = Object.freeze(["YYYY-YY", "YYYY-YYYY", "YY-YY"]);

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureInvoiceStoreShape(store) {
  if (!Array.isArray(store.invoices)) {
    store.invoices = [];
  }
  if (!Array.isArray(store.sequences)) {
    store.sequences = [];
  }
  if (!Array.isArray(store.tallyExports)) {
    store.tallyExports = [];
  }
  if (!store.proformaSequence || typeof store.proformaSequence !== "object") {
    store.proformaSequence = { lastNumber: 0, updatedAt: null };
  }
}

function cloneInvoice(invoice) {
  return JSON.parse(JSON.stringify(invoice));
}

function sanitizeInvoice(invoice) {
  return cloneInvoice(invoice);
}

function sanitizeInvoiceSummary(invoice) {
  return {
    id: invoice.id,
    orderId: invoice.orderId,
    orderNo: invoice.orderNo,
    invoiceNumber: invoice.invoiceNumber,
    documentType: invoice.documentType || "tax_invoice",
    invoiceDate: invoice.invoiceDate,
    financialYearLabel: invoice.financialYearLabel,
    sequenceNumber: Number(invoice.sequenceNumber || 0),
    customerName:
      invoice.buyer?.companyName || invoice.buyer?.name || "Customer",
    stateCode: invoice.placeOfSupply?.stateCode || "",
    paymentStatus: invoice.paymentStatus || "",
    grandTotal: Number(invoice.pricing?.grandTotal || 0),
    lockedAt: invoice.lockedAt || null,
    generatedAt: invoice.generatedAt || null
  };
}

function resolveFinancialYearLabel(dateInput, format = "YYYY-YY") {
  const targetDate = new Date(dateInput || Date.now());
  const targetMonth = targetDate.getUTCMonth();
  const targetYear = targetDate.getUTCFullYear();
  const startYear = targetMonth >= 3 ? targetYear : targetYear - 1;
  const endYear = startYear + 1;

  switch (format) {
    case "YYYY-YYYY":
      return `${startYear}-${endYear}`;
    case "YY-YY":
      return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
    case "YYYY-YY":
    default:
      return `${startYear}-${String(endYear).slice(-2)}`;
  }
}

// Changed 2026-09 at the user's request: keep the usual "JNX/2026-27/N"
// slash format on the actual (legal) invoice number -- only the zero-padding
// goes away, so sequence 1 prints as "JNX/2026-27/1" and sequence 1001 as
// "JNX/2026-27/1001", not "000001"/"001001". invoiceNumberPadding is
// intentionally no longer read here. (An earlier version of this function
// briefly stripped all punctuation for Tally-import purposes -- that need is
// served separately by the Tally export's own toTallyVoucherNo(), which
// derives a 16-char alphanumeric-only key from whatever invoiceNumber this
// produces; it does not require this field itself to drop the slashes.)
function buildInvoiceNumber(settings, financialYearLabel, sequenceNumber) {
  const prefix = String(settings?.invoicePrefix || "").trim();
  const postfix = String(settings?.invoicePostfix || "").trim();
  const sequence = String(Number(sequenceNumber || 0));

  return [prefix, financialYearLabel, sequence, postfix].filter(Boolean).join("/");
}

function buildProformaInvoiceNumber(sequenceNumber) {
  return `PROFORMA-${String(Number(sequenceNumber || 0)).padStart(2, "0")}`;
}

module.exports = {
  FINANCIAL_YEAR_FORMATS,
  roundMoney,
  ensureArray,
  ensureInvoiceStoreShape,
  sanitizeInvoice,
  sanitizeInvoiceSummary,
  resolveFinancialYearLabel,
  buildInvoiceNumber,
  buildProformaInvoiceNumber
};
