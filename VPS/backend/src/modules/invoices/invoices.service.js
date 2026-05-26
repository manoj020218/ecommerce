const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { readInvoiceStore, writeInvoiceStore } = require("../../database/invoice-store");
const { jsonFileStore } = require("../../database/json-file-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  roundMoney,
  ensureArray,
  ensureInvoiceStoreShape,
  sanitizeInvoice,
  sanitizeInvoiceSummary,
  resolveFinancialYearLabel,
  buildInvoiceNumber
} = require("./invoices.model");

function nowIso() {
  return new Date().toISOString();
}

function formatDateOnly(dateInput) {
  return new Date(dateInput || Date.now()).toISOString().slice(0, 10);
}

function normalizeStateCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
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

  return {
    storeName: storeProfile.storeName || "Jenix India",
    legalBusinessName: storeProfile.legalBusinessName || "",
    gstin: storeProfile.gstin || "",
    address: storeProfile.address || "",
    state: storeProfile.state || "",
    stateCode: normalizeStateCode(storeProfile.stateCode),
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
    state: source.state || "",
    stateCode: normalizeStateCode(source.stateCode),
    pincode: String(source.pincode || "").trim(),
    country: source.country || "India"
  };
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

function findOrderByIdOrNo(authStore, orderId) {
  return ensureArray(authStore.orders).find(
    (order) => order.id === orderId || order.orderNo === orderId
  );
}

function findInvoiceByOrderId(invoiceStore, orderId) {
  return ensureArray(invoiceStore.invoices).find(
    (invoice) => invoice.orderId === orderId || invoice.orderNo === orderId
  );
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
  const sequenceNumber = resolveNextSequence(
    invoiceStore,
    invoiceSettings,
    financialYearLabel
  );
  const invoiceNumber = buildInvoiceNumber(
    invoiceSettings,
    financialYearLabel,
    sequenceNumber
  );
  const items = ensureArray(order.items).map((item) =>
    buildOrderItemSnapshot(item, productLookup, placeOfSupply)
  );

  const cgstTotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.cgstAmount || 0), 0)
  );
  const sgstTotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.sgstAmount || 0), 0)
  );
  const igstTotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.igstAmount || 0), 0)
  );
  const invoiceId = generateId("invoice");
  const generatedAt = nowIso();

  return {
    id: invoiceId,
    orderId: order.id,
    orderNo: order.orderNo || "",
    checkoutSessionId: order.checkoutSessionId || null,
    invoiceNumber,
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
  if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
    throw new HttpError(409, "Invoice can be generated only after payment is confirmed.");
  }

  if (order.invoiceId) {
    const existingById = ensureArray(invoiceStore.invoices).find(
      (invoice) => invoice.id === order.invoiceId
    );
    if (existingById) {
      return {
        created: false,
        invoice: sanitizeInvoice(existingById)
      };
    }
  }

  const existingByOrder = findInvoiceByOrderId(invoiceStore, order.id);
  if (existingByOrder) {
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
  return {
    fileName: `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]+/g, "-")}.json`,
    format: "json_placeholder",
    invoice
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
