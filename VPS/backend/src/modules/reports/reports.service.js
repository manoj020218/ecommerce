const { HttpError } = require("../../common/http-error");
const { readAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { readInvoiceStore } = require("../../database/invoice-store");
const { readMarketingStore } = require("../../database/marketing-store");
const { readPaymentStore } = require("../../database/payment-store");
const { readRecoveryStore } = require("../../database/recovery-store");
const { readShippingStore } = require("../../database/shipping-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { roundMoney, ensureArray } = require("../invoices/invoices.model");
const { calculateAvailableQty } = require("../products/products.model");
const {
  REPORT_EXPORT_FORMATS,
  escapeXml,
  serializeReportCsv,
  serializeReportExcelHtml
} = require("./reports.model");

const SALES_REPORT_COLUMNS = Object.freeze([
  { key: "orderNo", label: "Order No" },
  { key: "invoiceNo", label: "Invoice No" },
  { key: "invoiceDate", label: "Invoice Date" },
  { key: "customerName", label: "Customer Name" },
  { key: "customerType", label: "Customer Type" },
  { key: "city", label: "City" },
  { key: "pincode", label: "Pincode" },
  { key: "state", label: "State" },
  { key: "gstin", label: "GSTIN" },
  { key: "productTotal", label: "Product Total" },
  { key: "discount", label: "Discount" },
  { key: "gst", label: "GST" },
  { key: "shipping", label: "Shipping" },
  { key: "grandTotal", label: "Grand Total" },
  { key: "paymentMethod", label: "Payment Method" },
  { key: "paymentStatus", label: "Payment Status" },
  { key: "orderStatus", label: "Order Status" },
  { key: "shipmentStatus", label: "Shipment Status" }
]);

const TALLY_REPORT_KEYS = new Set(["sales", "invoices", "gst"]);

function nowIso() {
  return new Date().toISOString();
}

function ensureAuthStoreShape(store) {
  if (!Array.isArray(store.orders)) {
    store.orders = [];
  }
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
  if (!Array.isArray(store.checkoutSessions)) {
    store.checkoutSessions = [];
  }
  if (!Array.isArray(store.paymentAttempts)) {
    store.paymentAttempts = [];
  }
}

function ensureCatalogStoreShape(store) {
  if (!Array.isArray(store.categories)) {
    store.categories = [];
  }
  if (!Array.isArray(store.products)) {
    store.products = [];
  }
  if (!Array.isArray(store.inventoryMovements)) {
    store.inventoryMovements = [];
  }
}

function ensureInvoiceStoreShape(store) {
  if (!Array.isArray(store.invoices)) {
    store.invoices = [];
  }
}

function ensureShippingStoreShape(store) {
  if (!Array.isArray(store.shipments)) {
    store.shipments = [];
  }
  if (!Array.isArray(store.courierProfiles)) {
    store.courierProfiles = [];
  }
}

function ensureRecoveryStoreShape(store) {
  if (!Array.isArray(store.recoveries)) {
    store.recoveries = [];
  }
}

function ensureMarketingStoreShape(store) {
  if (!Array.isArray(store.offers)) {
    store.offers = [];
  }
}

function ensurePaymentStoreShape(store) {
  if (!Array.isArray(store.manualPaymentSubmissions)) {
    store.manualPaymentSubmissions = [];
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function matchesContains(actual, expected) {
  if (!expected) {
    return true;
  }
  return normalizeText(actual).includes(normalizeText(expected));
}

function matchesExact(actual, expected) {
  if (!expected) {
    return true;
  }
  return normalizeText(actual) === normalizeText(expected);
}

function resolveDateWindow(filters) {
  if (filters.period === "custom") {
    if (!filters.dateFrom || !filters.dateTo) {
      throw new HttpError(400, "dateFrom and dateTo are required for custom reports.");
    }

    return {
      period: filters.period,
      month: null,
      year: null,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      startTs: Date.parse(`${filters.dateFrom}T00:00:00.000Z`),
      endTs: Date.parse(`${filters.dateTo}T23:59:59.999Z`),
      label: `${filters.dateFrom}-to-${filters.dateTo}`
    };
  }

  if (filters.period === "yearly") {
    const year = Number(filters.year || new Date().getUTCFullYear());
    return {
      period: filters.period,
      month: null,
      year,
      dateFrom: `${year}-01-01`,
      dateTo: `${year}-12-31`,
      startTs: Date.parse(`${year}-01-01T00:00:00.000Z`),
      endTs: Date.parse(`${year}-12-31T23:59:59.999Z`),
      label: String(year)
    };
  }

  const month = String(filters.month || new Date().toISOString().slice(0, 7));
  const [yearPart, monthPart] = month.split("-").map((value) => Number(value || 0));
  const monthStart = new Date(Date.UTC(yearPart, Math.max(0, monthPart - 1), 1));
  const monthEnd = new Date(Date.UTC(yearPart, monthPart, 0, 23, 59, 59, 999));

  return {
    period: "monthly",
    month,
    year: yearPart,
    dateFrom: monthStart.toISOString().slice(0, 10),
    dateTo: monthEnd.toISOString().slice(0, 10),
    startTs: monthStart.getTime(),
    endTs: monthEnd.getTime(),
    label: month
  };
}

function resolveTimestamp(value, treatAsDateOnly = false) {
  if (!value) {
    return Number.NaN;
  }
  const target = treatAsDateOnly ? `${value}T12:00:00.000Z` : value;
  return Date.parse(target);
}

function isWithinWindow(value, window, options = {}) {
  const timestamp = resolveTimestamp(value, Boolean(options.treatAsDateOnly));
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return timestamp >= window.startTs && timestamp <= window.endTs;
}

function resolveOrderAddress(order) {
  const billing = order?.billingAddress || {};
  const shipping = order?.shippingAddress || {};

  if (billing.city || billing.state || billing.pincode || billing.gstin || billing.name) {
    return billing;
  }

  return shipping;
}

function resolveOrderCustomerName(order) {
  const address = resolveOrderAddress(order);
  return address.companyName || address.name || "Customer";
}

function resolveOrderGstin(order) {
  const address = resolveOrderAddress(order);
  return address.gstin || address.gstNumber || "";
}

function resolveOrderCity(order) {
  return resolveOrderAddress(order).city || "";
}

function resolveOrderPincode(order) {
  return resolveOrderAddress(order).pincode || "";
}

function resolveOrderState(order) {
  const address = resolveOrderAddress(order);
  return address.state || address.stateCode || "";
}

function buildInvoiceByOrderId(invoices) {
  return new Map(ensureArray(invoices).map((invoice) => [invoice.orderId, invoice]));
}

function buildLatestShipmentByOrderId(shipments) {
  const map = new Map();

  for (const shipment of ensureArray(shipments)) {
    const existing = map.get(shipment.orderId);
    if (!existing) {
      map.set(shipment.orderId, shipment);
      continue;
    }

    const existingTs = resolveTimestamp(existing.updatedAt || existing.createdAt || "");
    const incomingTs = resolveTimestamp(shipment.updatedAt || shipment.createdAt || "");
    if (incomingTs >= existingTs) {
      map.set(shipment.orderId, shipment);
    }
  }

  return map;
}

function buildLatestAttemptByCheckoutId(attempts) {
  const map = new Map();

  for (const attempt of ensureArray(attempts)) {
    const existing = map.get(attempt.checkoutSessionId);
    if (!existing) {
      map.set(attempt.checkoutSessionId, attempt);
      continue;
    }

    const existingTs = resolveTimestamp(existing.updatedAt || existing.createdAt || "");
    const incomingTs = resolveTimestamp(attempt.updatedAt || attempt.createdAt || "");
    if (incomingTs >= existingTs) {
      map.set(attempt.checkoutSessionId, attempt);
    }
  }

  return map;
}

function matchesOrderFilters(order, shipment, filters) {
  if (!matchesContains(resolveOrderCity(order), filters.city)) {
    return false;
  }
  if (!matchesContains(resolveOrderPincode(order), filters.pincode)) {
    return false;
  }
  if (!matchesContains(resolveOrderState(order), filters.state)) {
    return false;
  }
  if (
    !matchesContains(
      `${shipment?.courierName || ""} ${shipment?.courierCode || ""}`,
      filters.courier
    )
  ) {
    return false;
  }
  if (!matchesExact(order.customerType || "", filters.customerType)) {
    return false;
  }
  if (!matchesExact(order.paymentStatus || "", filters.paymentStatus)) {
    return false;
  }
  if (!matchesExact(order.orderStatus || "", filters.orderStatus)) {
    return false;
  }
  if (!matchesExact(order.shipmentStatus || "", filters.shipmentStatus)) {
    return false;
  }

  return true;
}

function sumSalesSummary(rows) {
  return rows.reduce(
    (summary, row) => ({
      orderCount: Number(summary.orderCount || 0) + 1,
      invoiceCount: Number(summary.invoiceCount || 0) + (row.invoiceNo ? 1 : 0),
      productTotal: roundMoney(summary.productTotal + Number(row.productTotal || 0)),
      discount: roundMoney(summary.discount + Number(row.discount || 0)),
      gst: roundMoney(summary.gst + Number(row.gst || 0)),
      shipping: roundMoney(summary.shipping + Number(row.shipping || 0)),
      grandTotal: roundMoney(summary.grandTotal + Number(row.grandTotal || 0))
    }),
    {
      orderCount: 0,
      invoiceCount: 0,
      productTotal: 0,
      discount: 0,
      gst: 0,
      shipping: 0,
      grandTotal: 0
    }
  );
}

function buildSalesRow(order, invoice) {
  return {
    orderNo: order.orderNo || "",
    invoiceNo: invoice?.invoiceNumber || order.invoiceNumber || "",
    invoiceDate: invoice?.invoiceDate || "",
    customerName: resolveOrderCustomerName(order),
    customerType: order.customerType || "retail",
    city: resolveOrderCity(order),
    pincode: resolveOrderPincode(order),
    state: resolveOrderState(order),
    gstin: resolveOrderGstin(order),
    productTotal: Number(order.productSubtotal || 0),
    discount: Number(order.discountAmount || 0),
    gst: Number(order.gstTotal || 0),
    shipping: Number(order.shippingCharge || 0),
    grandTotal: Number(order.grandTotal || 0),
    paymentMethod: order.paymentMethod || "",
    paymentStatus: order.paymentStatus || "",
    orderStatus: order.orderStatus || "",
    shipmentStatus: order.shipmentStatus || ""
  };
}

function buildProductSalesRows(orders, productById, categoryById) {
  const aggregateMap = new Map();

  for (const order of orders) {
    for (const item of ensureArray(order.items)) {
      const product = productById.get(item.productId);
      const key = item.productId || `${item.sku}:${item.title}`;
      const current = aggregateMap.get(key) || {
        sku: item.sku || product?.sku || "",
        productTitle: item.title || product?.title || "",
        category: categoryById.get(product?.categoryId || "") || "",
        qtySold: 0,
        orderCount: 0,
        productRevenue: 0,
        gstTotal: 0,
        grandTotal: 0
      };

      current.qtySold += Number(item.qty || 0);
      current.orderCount += 1;
      current.productRevenue = roundMoney(
        current.productRevenue + Number(item.taxableValue || 0)
      );
      current.gstTotal = roundMoney(current.gstTotal + Number(item.gstAmount || 0));
      current.grandTotal = roundMoney(current.grandTotal + Number(item.lineTotal || 0));
      aggregateMap.set(key, current);
    }
  }

  return [...aggregateMap.values()].sort((a, b) => b.grandTotal - a.grandTotal);
}

function buildCityPincodeRows(orders, invoiceByOrderId) {
  const aggregateMap = new Map();

  for (const order of orders) {
    const city = resolveOrderCity(order) || "Unknown";
    const pincode = resolveOrderPincode(order) || "Unknown";
    const state = resolveOrderState(order) || "Unknown";
    const key = `${city}::${pincode}::${state}`;
    const invoice = invoiceByOrderId.get(order.id);
    const current = aggregateMap.get(key) || {
      city,
      pincode,
      state,
      orderCount: 0,
      invoiceCount: 0,
      paidOrders: 0,
      shippingTotal: 0,
      grandTotal: 0
    };

    current.orderCount += 1;
    current.invoiceCount += invoice ? 1 : 0;
    current.paidOrders += normalizeText(order.paymentStatus) === "paid" ? 1 : 0;
    current.shippingTotal = roundMoney(
      current.shippingTotal + Number(order.shippingCharge || 0)
    );
    current.grandTotal = roundMoney(current.grandTotal + Number(order.grandTotal || 0));
    aggregateMap.set(key, current);
  }

  return [...aggregateMap.values()].sort((a, b) => b.grandTotal - a.grandTotal);
}

function buildTallyRows(invoices, period) {
  return ensureArray(invoices).map((invoice) => {
    const [year, month] = String(invoice.invoiceDate || "").split("-");
    const periodKey = period === "yearly" ? year || "" : year && month ? `${year}-${month}` : "";

    return {
      voucherDate: invoice.invoiceDate || "",
      invoiceNumber: invoice.invoiceNumber || "",
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
      periodKey
    };
  });
}

function buildTallyCsv(rows) {
  const header = [
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
  ].join(",");

  const lines = rows.map((row) =>
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
      .map((value) => String(value ?? "").replace(/"/g, "\"\""))
      .map((value) => (/[",\n]/.test(value) ? `"${value}"` : value))
      .join(",")
  );

  return [header, ...lines].join("\n");
}

function buildTallyXml(rows) {
  const entries = rows
    .map(
      (row) => [
        "<VOUCHER>",
        `<DATE>${escapeXml(row.voucherDate)}</DATE>`,
        `<INVOICE>${escapeXml(row.invoiceNumber)}</INVOICE>`,
        `<ORDER>${escapeXml(row.orderNumber)}</ORDER>`,
        `<PARTY>${escapeXml(row.partyName)}</PARTY>`,
        `<GSTIN>${escapeXml(row.partyGstin)}</GSTIN>`,
        `<PLACEOFSUPPLY>${escapeXml(row.placeOfSupply)}</PLACEOFSUPPLY>`,
        `<TAXABLEVALUE>${row.taxableValue}</TAXABLEVALUE>`,
        `<CGST>${row.cgstTotal}</CGST>`,
        `<SGST>${row.sgstTotal}</SGST>`,
        `<IGST>${row.igstTotal}</IGST>`,
        `<SHIPPING>${row.shippingCharge}</SHIPPING>`,
        `<ROUNDOFF>${row.roundOff}</ROUNDOFF>`,
        `<GRANDTOTAL>${row.grandTotal}</GRANDTOTAL>`,
        `<PAYMENTSTATUS>${escapeXml(row.paymentStatus)}</PAYMENTSTATUS>`,
        `<PERIODKEY>${escapeXml(row.periodKey)}</PERIODKEY>`,
        "</VOUCHER>"
      ].join("")
    )
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE>",
    "<BODY>",
    "<VOUCHERS>",
    entries,
    "</VOUCHERS>",
    "</BODY>",
    "</ENVELOPE>"
  ].join("");
}

function escapePdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdf(title, lines) {
  const printableLines = [title, ...ensureArray(lines)].slice(0, 40);
  const streamLines = ["BT", "/F1 12 Tf", "50 790 Td", "14 TL"];

  printableLines.forEach((line, index) => {
    if (index > 0) {
      streamLines.push("T*");
    }
    streamLines.push(`(${escapePdfText(line)}) Tj`);
  });

  streamLines.push("ET");

  const stream = streamLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "utf-8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  const parts = [Buffer.from("%PDF-1.4\n", "ascii")];
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    const offset = parts.reduce((sum, part) => sum + part.length, 0);
    offsets.push(offset);
    parts.push(Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, "utf-8"));
  }

  const xrefOffset = parts.reduce((sum, part) => sum + part.length, 0);
  const xref = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f "
  ];

  for (let index = 1; index < offsets.length; index += 1) {
    xref.push(`${String(offsets[index]).padStart(10, "0")} 00000 n `);
  }

  const trailer = [
    xref.join("\n"),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF"
  ].join("\n");

  parts.push(Buffer.from(`${trailer}\n`, "ascii"));
  return Buffer.concat(parts);
}

function buildCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 1) === 1) {
        crc = 0xedb88320 ^ (crc >>> 1);
      } else {
        crc >>>= 1;
      }
    }
    table[index] = crc >>> 0;
  }

  return table;
}

const CRC32_TABLE = buildCrc32Table();

function computeCrc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildZipArchive(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const fileNameBuffer = Buffer.from(file.name, "utf-8");
    const fileDataBuffer = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(String(file.content || ""), "utf-8");
    const crc32 = computeCrc32(fileDataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(fileDataBuffer.length, 18);
    localHeader.writeUInt32LE(fileDataBuffer.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileNameBuffer, fileDataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc32, 16);
    centralHeader.writeUInt32LE(fileDataBuffer.length, 20);
    centralHeader.writeUInt32LE(fileDataBuffer.length, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, fileNameBuffer);
    offset += localHeader.length + fileNameBuffer.length + fileDataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function toSummaryLines(report) {
  const lines = [];

  for (const [key, value] of Object.entries(report.summary || {})) {
    const label = key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/^./, (char) => char.toUpperCase());
    lines.push(`${label}: ${value}`);
  }

  lines.push(`Rows: ${report.rowCount}`);
  lines.push(`Period: ${report.filters.dateFrom} to ${report.filters.dateTo}`);
  return lines;
}

function buildExportFileName(report, extension) {
  return `${report.reportKey}-${report.filters.label}.${extension}`;
}

function listAvailableFormats(reportKey) {
  const formats = ["csv", "excel", "json", "pdf-summary"];

  if (reportKey === "invoices") {
    formats.push("invoice-zip");
  }
  if (TALLY_REPORT_KEYS.has(reportKey)) {
    formats.push("tally-csv", "tally-xml");
  }

  return REPORT_EXPORT_FORMATS.filter((format) => formats.includes(format));
}

async function buildReportContext() {
  const [
    authStore,
    catalogStore,
    invoiceStore,
    marketingStore,
    paymentStore,
    recoveryStore,
    shippingStore
  ] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readInvoiceStore(),
    readMarketingStore(),
    readPaymentStore(),
    readRecoveryStore(),
    readShippingStore()
  ]);

  ensureAuthStoreShape(authStore);
  ensureCatalogStoreShape(catalogStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensureMarketingStoreShape(marketingStore);
  ensurePaymentStoreShape(paymentStore);
  ensureRecoveryStoreShape(recoveryStore);
  ensureShippingStoreShape(shippingStore);

  return {
    authStore,
    catalogStore,
    invoiceStore,
    marketingStore,
    paymentStore,
    recoveryStore,
    shippingStore,
    invoiceByOrderId: buildInvoiceByOrderId(invoiceStore.invoices),
    shipmentByOrderId: buildLatestShipmentByOrderId(shippingStore.shipments),
    latestAttemptByCheckoutId: buildLatestAttemptByCheckoutId(authStore.paymentAttempts),
    productById: new Map(ensureArray(catalogStore.products).map((row) => [row.id, row])),
    categoryById: new Map(ensureArray(catalogStore.categories).map((row) => [row.id, row.name]))
  };
}

function buildSalesReport(context, filters, window) {
  const orders = ensureArray(context.authStore.orders)
    .filter(
      (order) =>
        normalizeText(order.paymentStatus) === "paid" ||
        Boolean(context.invoiceByOrderId.get(order.id))
    )
    .filter((order) => {
      const invoice = context.invoiceByOrderId.get(order.id);
      const shipment = context.shipmentByOrderId.get(order.id);
      const dateValue = invoice?.invoiceDate || order.paymentVerifiedAt || order.createdAt;
      return isWithinWindow(dateValue, window, {
        treatAsDateOnly: Boolean(invoice?.invoiceDate)
      }) && matchesOrderFilters(order, shipment, filters);
    })
    .sort((a, b) => {
      const aInvoice = context.invoiceByOrderId.get(a.id);
      const bInvoice = context.invoiceByOrderId.get(b.id);
      const aTs = resolveTimestamp(
        aInvoice?.invoiceDate || a.paymentVerifiedAt || a.createdAt,
        Boolean(aInvoice?.invoiceDate)
      );
      const bTs = resolveTimestamp(
        bInvoice?.invoiceDate || b.paymentVerifiedAt || b.createdAt,
        Boolean(bInvoice?.invoiceDate)
      );
      return bTs - aTs;
    });

  const rows = orders.map((order) =>
    buildSalesRow(order, context.invoiceByOrderId.get(order.id))
  );

  return {
    reportKey: "sales",
    title: "Sales Report",
    generatedAt: nowIso(),
    filters: window,
    columns: SALES_REPORT_COLUMNS,
    rows,
    rowCount: rows.length,
    summary: sumSalesSummary(rows),
    availableFormats: listAvailableFormats("sales")
  };
}

function buildInvoicesReport(context, filters, window) {
  const rows = ensureArray(context.invoiceStore.invoices)
    .filter((invoice) => isWithinWindow(invoice.invoiceDate, window, { treatAsDateOnly: true }))
    .map((invoice) => {
      const order = ensureArray(context.authStore.orders).find((row) => row.id === invoice.orderId);
      const shipment = order ? context.shipmentByOrderId.get(order.id) : null;
      if (order && !matchesOrderFilters(order, shipment, filters)) {
        return null;
      }

      return {
        invoiceNo: invoice.invoiceNumber || "",
        invoiceDate: invoice.invoiceDate || "",
        orderNo: invoice.orderNo || "",
        customerName: invoice.buyer?.companyName || invoice.buyer?.name || "Customer",
        city: invoice.buyer?.city || "",
        pincode: invoice.buyer?.pincode || "",
        state: invoice.buyer?.state || invoice.placeOfSupply?.stateCode || "",
        gstin: invoice.buyer?.gstin || "",
        paymentMethod: invoice.paymentMethod || "",
        paymentStatus: invoice.paymentStatus || "",
        taxableValue: Number(invoice.pricing?.taxableValue || 0),
        gst: Number(invoice.pricing?.gstTotal || 0),
        shipping: Number(invoice.pricing?.shippingCharge || 0),
        grandTotal: Number(invoice.pricing?.grandTotal || 0)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  const summary = rows.reduce(
    (current, row) => ({
      invoiceCount: current.invoiceCount + 1,
      taxableValue: roundMoney(current.taxableValue + row.taxableValue),
      gst: roundMoney(current.gst + row.gst),
      shipping: roundMoney(current.shipping + row.shipping),
      grandTotal: roundMoney(current.grandTotal + row.grandTotal)
    }),
    {
      invoiceCount: 0,
      taxableValue: 0,
      gst: 0,
      shipping: 0,
      grandTotal: 0
    }
  );

  return {
    reportKey: "invoices",
    title: "Invoice Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "invoiceNo", label: "Invoice No" },
      { key: "invoiceDate", label: "Invoice Date" },
      { key: "orderNo", label: "Order No" },
      { key: "customerName", label: "Customer Name" },
      { key: "city", label: "City" },
      { key: "pincode", label: "Pincode" },
      { key: "state", label: "State" },
      { key: "gstin", label: "GSTIN" },
      { key: "paymentMethod", label: "Payment Method" },
      { key: "paymentStatus", label: "Payment Status" },
      { key: "taxableValue", label: "Taxable Value" },
      { key: "gst", label: "GST" },
      { key: "shipping", label: "Shipping" },
      { key: "grandTotal", label: "Grand Total" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("invoices")
  };
}

function buildGstReport(context, filters, window) {
  const rows = ensureArray(context.invoiceStore.invoices)
    .filter((invoice) => isWithinWindow(invoice.invoiceDate, window, { treatAsDateOnly: true }))
    .map((invoice) => {
      const order = ensureArray(context.authStore.orders).find((row) => row.id === invoice.orderId);
      const shipment = order ? context.shipmentByOrderId.get(order.id) : null;
      if (order && !matchesOrderFilters(order, shipment, filters)) {
        return null;
      }

      return {
        invoiceNo: invoice.invoiceNumber || "",
        invoiceDate: invoice.invoiceDate || "",
        customerName: invoice.buyer?.companyName || invoice.buyer?.name || "Customer",
        gstin: invoice.buyer?.gstin || "",
        stateCode: invoice.placeOfSupply?.stateCode || "",
        taxMode: invoice.placeOfSupply?.taxMode || "",
        taxableValue: Number(invoice.pricing?.taxableValue || 0),
        cgstTotal: Number(invoice.pricing?.cgstTotal || 0),
        sgstTotal: Number(invoice.pricing?.sgstTotal || 0),
        igstTotal: Number(invoice.pricing?.igstTotal || 0),
        grandTotal: Number(invoice.pricing?.grandTotal || 0)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  const summary = rows.reduce(
    (current, row) => ({
      invoiceCount: current.invoiceCount + 1,
      taxableValue: roundMoney(current.taxableValue + row.taxableValue),
      cgstTotal: roundMoney(current.cgstTotal + row.cgstTotal),
      sgstTotal: roundMoney(current.sgstTotal + row.sgstTotal),
      igstTotal: roundMoney(current.igstTotal + row.igstTotal),
      grandTotal: roundMoney(current.grandTotal + row.grandTotal)
    }),
    {
      invoiceCount: 0,
      taxableValue: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      grandTotal: 0
    }
  );

  return {
    reportKey: "gst",
    title: "GST Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "invoiceNo", label: "Invoice No" },
      { key: "invoiceDate", label: "Invoice Date" },
      { key: "customerName", label: "Customer Name" },
      { key: "gstin", label: "GSTIN" },
      { key: "stateCode", label: "State Code" },
      { key: "taxMode", label: "Tax Mode" },
      { key: "taxableValue", label: "Taxable Value" },
      { key: "cgstTotal", label: "CGST" },
      { key: "sgstTotal", label: "SGST" },
      { key: "igstTotal", label: "IGST" },
      { key: "grandTotal", label: "Grand Total" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("gst")
  };
}

function buildPaymentsReport(context, filters, window) {
  const rows = ensureArray(context.authStore.orders)
    .filter((order) => isWithinWindow(order.paymentVerifiedAt || order.createdAt, window))
    .filter((order) =>
      matchesOrderFilters(order, context.shipmentByOrderId.get(order.id), filters)
    )
    .map((order) => {
      const latestAttempt = context.latestAttemptByCheckoutId.get(order.checkoutSessionId);
      return {
        orderNo: order.orderNo || "",
        customerName: resolveOrderCustomerName(order),
        city: resolveOrderCity(order),
        paymentMethod: order.paymentMethod || "",
        paymentGateway: latestAttempt?.gateway || order.paymentMethod || "",
        paymentStatus: order.paymentStatus || "",
        amount: Number(order.grandTotal || 0),
        gatewayTxnId: order.gatewayTxnId || latestAttempt?.gatewayTxnId || "",
        paymentVerifiedAt: order.paymentVerifiedAt || "",
        orderStatus: order.orderStatus || ""
      };
    })
    .sort(
      (a, b) =>
        resolveTimestamp(b.paymentVerifiedAt || "") -
        resolveTimestamp(a.paymentVerifiedAt || "")
    );

  const summary = rows.reduce(
    (current, row) => ({
      orderCount: current.orderCount + 1,
      paidCount: current.paidCount + (normalizeText(row.paymentStatus) === "paid" ? 1 : 0),
      totalAmount: roundMoney(current.totalAmount + row.amount)
    }),
    {
      orderCount: 0,
      paidCount: 0,
      totalAmount: 0
    }
  );

  return {
    reportKey: "payments",
    title: "Payment Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "orderNo", label: "Order No" },
      { key: "customerName", label: "Customer Name" },
      { key: "city", label: "City" },
      { key: "paymentMethod", label: "Payment Method" },
      { key: "paymentGateway", label: "Gateway" },
      { key: "paymentStatus", label: "Payment Status" },
      { key: "amount", label: "Amount" },
      { key: "gatewayTxnId", label: "Gateway Txn ID" },
      { key: "paymentVerifiedAt", label: "Payment Verified At" },
      { key: "orderStatus", label: "Order Status" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("payments")
  };
}

function buildShippingReport(context, filters, window) {
  const rows = ensureArray(context.authStore.orders)
    .filter((order) => {
      const shipment = context.shipmentByOrderId.get(order.id);
      const dateValue =
        shipment?.updatedAt ||
        shipment?.createdAt ||
        order.paymentVerifiedAt ||
        order.createdAt;
      return isWithinWindow(dateValue, window) && matchesOrderFilters(order, shipment, filters);
    })
    .map((order) => {
      const shipment = context.shipmentByOrderId.get(order.id);
      return {
        orderNo: order.orderNo || "",
        customerName: resolveOrderCustomerName(order),
        city: resolveOrderCity(order),
        pincode: resolveOrderPincode(order),
        courierName: shipment?.courierName || shipment?.courierCode || "",
        trackingId: shipment?.trackingId || "",
        shippingMethod: order.shippingMethod || "",
        shippingCharge: Number(order.shippingCharge || 0),
        shipmentStatus: shipment?.shipmentStatus || order.shipmentStatus || "",
        dispatchDate: shipment?.dispatchDate || "",
        expectedDeliveryDate: shipment?.expectedDeliveryDate || "",
        deliveredAt: shipment?.deliveredAt || ""
      };
    })
    .sort(
      (a, b) =>
        resolveTimestamp(b.deliveredAt || b.dispatchDate || "") -
        resolveTimestamp(a.deliveredAt || a.dispatchDate || "")
    );

  const summary = rows.reduce(
    (current, row) => ({
      orderCount: current.orderCount + 1,
      shippedCount:
        current.shippedCount + (normalizeText(row.shipmentStatus) === "shipped" ? 1 : 0),
      deliveredCount:
        current.deliveredCount + (normalizeText(row.shipmentStatus) === "delivered" ? 1 : 0),
      shippingCharge: roundMoney(current.shippingCharge + row.shippingCharge)
    }),
    {
      orderCount: 0,
      shippedCount: 0,
      deliveredCount: 0,
      shippingCharge: 0
    }
  );

  return {
    reportKey: "shipping",
    title: "Shipping Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "orderNo", label: "Order No" },
      { key: "customerName", label: "Customer Name" },
      { key: "city", label: "City" },
      { key: "pincode", label: "Pincode" },
      { key: "courierName", label: "Courier" },
      { key: "trackingId", label: "Tracking ID" },
      { key: "shippingMethod", label: "Shipping Method" },
      { key: "shippingCharge", label: "Shipping Charge" },
      { key: "shipmentStatus", label: "Shipment Status" },
      { key: "dispatchDate", label: "Dispatch Date" },
      { key: "expectedDeliveryDate", label: "Expected Delivery" },
      { key: "deliveredAt", label: "Delivered At" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("shipping")
  };
}

function buildDealerSalesReport(context, filters, window) {
  const nextFilters = {
    ...filters,
    customerType: filters.customerType || "dealer"
  };
  const baseReport = buildSalesReport(context, nextFilters, window);
  const rows = baseReport.rows.filter((row) =>
    ["dealer", "stockist"].includes(normalizeText(row.customerType))
  );

  return {
    ...baseReport,
    reportKey: "dealer-sales",
    title: "Dealer / Stockist Sales Report",
    rows,
    rowCount: rows.length,
    summary: sumSalesSummary(rows),
    availableFormats: listAvailableFormats("dealer-sales")
  };
}

function buildProductSalesReport(context, filters, window) {
  const filteredOrders = ensureArray(context.authStore.orders)
    .filter(
      (order) =>
        normalizeText(order.paymentStatus) === "paid" ||
        Boolean(context.invoiceByOrderId.get(order.id))
    )
    .filter((order) => {
      const invoice = context.invoiceByOrderId.get(order.id);
      const dateValue = invoice?.invoiceDate || order.paymentVerifiedAt || order.createdAt;
      return isWithinWindow(dateValue, window, {
        treatAsDateOnly: Boolean(invoice?.invoiceDate)
      }) && matchesOrderFilters(order, context.shipmentByOrderId.get(order.id), filters);
    });

  const rows = buildProductSalesRows(
    filteredOrders,
    context.productById,
    context.categoryById
  );
  const summary = rows.reduce(
    (current, row) => ({
      productCount: current.productCount + 1,
      unitsSold: current.unitsSold + row.qtySold,
      productRevenue: roundMoney(current.productRevenue + row.productRevenue),
      gstTotal: roundMoney(current.gstTotal + row.gstTotal),
      grandTotal: roundMoney(current.grandTotal + row.grandTotal)
    }),
    {
      productCount: 0,
      unitsSold: 0,
      productRevenue: 0,
      gstTotal: 0,
      grandTotal: 0
    }
  );

  return {
    reportKey: "product-sales",
    title: "Product Sales Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "sku", label: "SKU" },
      { key: "productTitle", label: "Product" },
      { key: "category", label: "Category" },
      { key: "qtySold", label: "Qty Sold" },
      { key: "orderCount", label: "Order Count" },
      { key: "productRevenue", label: "Product Revenue" },
      { key: "gstTotal", label: "GST Total" },
      { key: "grandTotal", label: "Grand Total" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("product-sales")
  };
}

function buildCityPincodeReport(context, filters, window) {
  const filteredOrders = ensureArray(context.authStore.orders)
    .filter(
      (order) =>
        normalizeText(order.paymentStatus) === "paid" ||
        Boolean(context.invoiceByOrderId.get(order.id))
    )
    .filter((order) => {
      const invoice = context.invoiceByOrderId.get(order.id);
      const dateValue = invoice?.invoiceDate || order.paymentVerifiedAt || order.createdAt;
      return isWithinWindow(dateValue, window, {
        treatAsDateOnly: Boolean(invoice?.invoiceDate)
      }) && matchesOrderFilters(order, context.shipmentByOrderId.get(order.id), filters);
    });

  const rows = buildCityPincodeRows(filteredOrders, context.invoiceByOrderId);
  const summary = rows.reduce(
    (current, row) => ({
      regionCount: current.regionCount + 1,
      orderCount: current.orderCount + row.orderCount,
      grandTotal: roundMoney(current.grandTotal + row.grandTotal)
    }),
    {
      regionCount: 0,
      orderCount: 0,
      grandTotal: 0
    }
  );

  return {
    reportKey: "city-pincode-orders",
    title: "City / Pincode Order Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "city", label: "City" },
      { key: "pincode", label: "Pincode" },
      { key: "state", label: "State" },
      { key: "orderCount", label: "Order Count" },
      { key: "invoiceCount", label: "Invoice Count" },
      { key: "paidOrders", label: "Paid Orders" },
      { key: "shippingTotal", label: "Shipping Total" },
      { key: "grandTotal", label: "Grand Total" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("city-pincode-orders")
  };
}

function buildAbandonedCartReport(context, _filters, window) {
  const rows = ensureArray(context.recoveryStore.recoveries)
    .filter((row) => isWithinWindow(row.lastActivityAt || row.createdAt, window))
    .map((row) => ({
      recoveryId: row.id,
      stage: row.stage || "",
      ownerId: row.ownerId || "",
      customerEmail: row.email || row.customerEmail || "",
      cartItemCount: Number(row.cartItemCount || 0),
      reminderCount: Number(row.reminderCount || 0),
      paymentAttemptId: row.paymentAttemptId || "",
      failureReason: row.failureReason || "",
      feedbackReason: row.feedbackReason || "",
      recoveredOrderId: row.recoveredOrderId || "",
      lastActivityAt: row.lastActivityAt || row.createdAt || ""
    }))
    .sort(
      (a, b) =>
        resolveTimestamp(b.lastActivityAt || "") - resolveTimestamp(a.lastActivityAt || "")
    );

  const summary = rows.reduce(
    (current, row) => ({
      recoveryCount: current.recoveryCount + 1,
      recoveredCount: current.recoveredCount + (row.recoveredOrderId ? 1 : 0),
      reminderCount: current.reminderCount + row.reminderCount
    }),
    {
      recoveryCount: 0,
      recoveredCount: 0,
      reminderCount: 0
    }
  );

  return {
    reportKey: "abandoned-carts",
    title: "Abandoned Cart Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "recoveryId", label: "Recovery ID" },
      { key: "stage", label: "Stage" },
      { key: "ownerId", label: "Owner" },
      { key: "customerEmail", label: "Email" },
      { key: "cartItemCount", label: "Cart Items" },
      { key: "reminderCount", label: "Reminders" },
      { key: "paymentAttemptId", label: "Payment Attempt" },
      { key: "failureReason", label: "Failure Reason" },
      { key: "feedbackReason", label: "Feedback" },
      { key: "recoveredOrderId", label: "Recovered Order" },
      { key: "lastActivityAt", label: "Last Activity" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("abandoned-carts")
  };
}

function buildMarketingOffersReport(context, filters, window) {
  const rows = ensureArray(context.marketingStore.offers)
    .filter((offer) =>
      isWithinWindow(offer.updatedAt || offer.createdAt || offer.startsAt, window)
    )
    .filter((offer) => matchesExact(offer.customerType || "", filters.customerType))
    .map((offer) => ({
      offerName: offer.name || "",
      offerType: offer.type || "",
      couponCode: offer.couponCode || "",
      customerType: offer.customerType || "",
      isActive: Boolean(offer.isActive),
      startsAt: offer.startsAt || "",
      endsAt: offer.endsAt || "",
      productLinks: ensureArray(offer.productIds).length,
      categoryLinks: ensureArray(offer.categoryIds).length,
      notes: offer.notes || ""
    }))
    .sort((a, b) =>
      String(b.startsAt || b.endsAt || "").localeCompare(String(a.startsAt || a.endsAt || ""))
    );

  const summary = rows.reduce(
    (current, row) => ({
      offerCount: current.offerCount + 1,
      activeCount: current.activeCount + (row.isActive ? 1 : 0),
      inactiveCount: current.inactiveCount + (row.isActive ? 0 : 1)
    }),
    {
      offerCount: 0,
      activeCount: 0,
      inactiveCount: 0
    }
  );

  return {
    reportKey: "marketing-offers",
    title: "Marketing Offer Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "offerName", label: "Offer Name" },
      { key: "offerType", label: "Offer Type" },
      { key: "couponCode", label: "Coupon Code" },
      { key: "customerType", label: "Customer Type" },
      { key: "isActive", label: "Active" },
      { key: "startsAt", label: "Starts At" },
      { key: "endsAt", label: "Ends At" },
      { key: "productLinks", label: "Linked Products" },
      { key: "categoryLinks", label: "Linked Categories" },
      { key: "notes", label: "Notes" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("marketing-offers")
  };
}

function buildInventoryReport(context, _filters, window) {
  const rows = ensureArray(context.catalogStore.products)
    .filter((product) => {
      if (!product.updatedAt) {
        return true;
      }
      return isWithinWindow(product.updatedAt, window);
    })
    .map((product) => ({
      sku: product.sku || "",
      title: product.title || "",
      category: context.categoryById.get(product.categoryId || "") || "",
      stockStatus: product.stockStatus || "",
      stockQty: Number(product.stockQty || 0),
      reservedQty: Number(product.reservedQty || 0),
      availableQty: Number(calculateAvailableQty(product) || 0),
      lowStockThreshold: Number(product.lowStockThreshold || 0),
      isActive: Boolean(product.isActive),
      updatedAt: product.updatedAt || ""
    }))
    .sort((a, b) => a.availableQty - b.availableQty);

  const summary = rows.reduce(
    (current, row) => ({
      productCount: current.productCount + 1,
      activeCount: current.activeCount + (row.isActive ? 1 : 0),
      lowStockCount:
        current.lowStockCount + (normalizeText(row.stockStatus) === "low_stock" ? 1 : 0),
      outOfStockCount:
        current.outOfStockCount +
        (normalizeText(row.stockStatus) === "out_of_stock" ? 1 : 0),
      availableQty: current.availableQty + row.availableQty,
      reservedQty: current.reservedQty + row.reservedQty
    }),
    {
      productCount: 0,
      activeCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      availableQty: 0,
      reservedQty: 0
    }
  );

  return {
    reportKey: "inventory",
    title: "Inventory Report",
    generatedAt: nowIso(),
    filters: window,
    columns: [
      { key: "sku", label: "SKU" },
      { key: "title", label: "Product" },
      { key: "category", label: "Category" },
      { key: "stockStatus", label: "Stock Status" },
      { key: "stockQty", label: "Stock Qty" },
      { key: "reservedQty", label: "Reserved Qty" },
      { key: "availableQty", label: "Available Qty" },
      { key: "lowStockThreshold", label: "Low Stock Threshold" },
      { key: "isActive", label: "Active" },
      { key: "updatedAt", label: "Updated At" }
    ],
    rows,
    rowCount: rows.length,
    summary,
    availableFormats: listAvailableFormats("inventory")
  };
}

function buildReport(reportKey, context, filters, window) {
  switch (reportKey) {
    case "sales":
      return buildSalesReport(context, filters, window);
    case "invoices":
      return buildInvoicesReport(context, filters, window);
    case "gst":
      return buildGstReport(context, filters, window);
    case "payments":
      return buildPaymentsReport(context, filters, window);
    case "shipping":
      return buildShippingReport(context, filters, window);
    case "dealer-sales":
      return buildDealerSalesReport(context, filters, window);
    case "product-sales":
      return buildProductSalesReport(context, filters, window);
    case "city-pincode-orders":
      return buildCityPincodeReport(context, filters, window);
    case "abandoned-carts":
      return buildAbandonedCartReport(context, filters, window);
    case "marketing-offers":
      return buildMarketingOffersReport(context, filters, window);
    case "inventory":
      return buildInventoryReport(context, filters, window);
    default:
      throw new HttpError(404, "Report type not found.");
  }
}

async function getReport(reportKey, filters) {
  const context = await buildReportContext();
  const window = resolveDateWindow(filters);
  return buildReport(reportKey, context, filters, window);
}

async function exportReport(reportKey, filters, actor, format) {
  const context = await buildReportContext();
  const window = resolveDateWindow(filters);
  const report = buildReport(reportKey, context, filters, window);

  let contentType = "application/json; charset=utf-8";
  let fileName = buildExportFileName(report, "json");
  let content = Buffer.from(JSON.stringify(report, null, 2), "utf-8");

  if (format === "csv") {
    contentType = "text/csv; charset=utf-8";
    fileName = buildExportFileName(report, "csv");
    content = Buffer.from(serializeReportCsv(report), "utf-8");
  } else if (format === "excel") {
    contentType = "application/vnd.ms-excel; charset=utf-8";
    fileName = buildExportFileName(report, "xls");
    content = Buffer.from(serializeReportExcelHtml(report), "utf-8");
  } else if (format === "pdf-summary") {
    contentType = "application/pdf";
    fileName = buildExportFileName(report, "pdf");
    content = buildSimplePdf(report.title, toSummaryLines(report));
  } else if (format === "invoice-zip") {
    if (reportKey !== "invoices") {
      throw new HttpError(400, "Invoice ZIP export is available only for the invoice report.");
    }

    const matchingInvoices = ensureArray(context.invoiceStore.invoices).filter((invoice) =>
      isWithinWindow(invoice.invoiceDate, window, { treatAsDateOnly: true })
    );
    const files = matchingInvoices.map((invoice) => ({
      name: `${String(invoice.invoiceNumber || invoice.id).replace(/[^a-zA-Z0-9._-]+/g, "-")}.json`,
      content: JSON.stringify(invoice, null, 2)
    }));

    contentType = "application/zip";
    fileName = buildExportFileName(report, "zip");
    content = buildZipArchive(files);
  } else if (format === "tally-csv" || format === "tally-xml") {
    if (!TALLY_REPORT_KEYS.has(reportKey)) {
      throw new HttpError(
        400,
        "Tally export is available only for sales, invoice, and GST reports."
      );
    }

    const matchingInvoices = ensureArray(context.invoiceStore.invoices).filter((invoice) =>
      isWithinWindow(invoice.invoiceDate, window, { treatAsDateOnly: true })
    );
    const tallyRows = buildTallyRows(matchingInvoices, window.period);

    if (format === "tally-csv") {
      contentType = "text/csv; charset=utf-8";
      fileName = `tally-${reportKey}-${window.label}.csv`;
      content = Buffer.from(buildTallyCsv(tallyRows), "utf-8");
    } else {
      contentType = "application/xml; charset=utf-8";
      fileName = `tally-${reportKey}-${window.label}.xml`;
      content = Buffer.from(buildTallyXml(tallyRows), "utf-8");
    }
  }

  await addActivityLog({
    action: "reports.exported",
    actorId: actor?.id || "system",
    actorRole: actor?.role || "system",
    resourceType: "report_export",
    resourceId: reportKey,
    metadata: {
      format,
      rowCount: report.rowCount,
      period: window.period,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo
    }
  });

  return {
    fileName,
    contentType,
    content
  };
}

module.exports = {
  getReport,
  exportReport
};
