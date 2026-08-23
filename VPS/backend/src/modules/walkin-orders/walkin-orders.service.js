const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { readPaymentStore } = require("../../database/payment-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const partnersService = require("../partners/partners.service");
const {
  SHIPPING_METHODS
} = require("../cart-checkout/cart-checkout.model");
const {
  ensureCustomerAccountShape
} = require("../customer-account/customer-account.model");
const {
  ORDER_MODES,
  normalizeCustomerType,
  normalizePriceGroup,
  buildCustomerPricingContext
} = require("../customers/customers.model");
const {
  resolveProductUnitPrice,
  calculateAvailableQty
} = require("../products/products.model");
const {
  ensurePaymentStoreShape
} = require("../payment-gateways/payment-gateways.service");
const {
  resolveDirectPaymentDiscountPercent
} = require("../payment-gateways/payment-gateways.model");
const { ensureInvoiceForOrder } = require("../invoices/invoices.service");
const { getAllSettings } = require("../settings/settings.service");
const { notifyCustomerEvent } = require("../marketing/marketing.service");
const {
  WALKIN_PRICE_MODES,
  WALKIN_PAYMENT_METHODS,
  WALKIN_ORDER_STATUSES,
  roundMoney,
  ensureArray,
  sanitizeWalkInCustomer,
  sanitizeWalkInProduct,
  sanitizeWalkInOrderSummary
} = require("./walkin-orders.model");

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeMobile(value) {
  return String(value || "").trim();
}

function normalizeStateCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeGstin(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function ensureAuthStoreShape(store) {
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
  if (!Array.isArray(store.orders)) {
    store.orders = [];
  }

  for (const user of store.users) {
    ensureCustomerAccountShape(user);
  }
}

function ensureCatalogStoreShape(store) {
  if (!Array.isArray(store.products)) {
    store.products = [];
  }
  if (!Array.isArray(store.categories)) {
    store.categories = [];
  }
}

function generateWalkInOrderNo(authStore) {
  const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const counter =
    ensureArray(authStore.orders).filter((row) => row.isWalkInOrder).length + 1;
  return `JNX-WLK-${prefix}-${String(counter).padStart(5, "0")}`;
}

function findWalkInOrderOrThrow(authStore, orderId) {
  const order = ensureArray(authStore.orders).find(
    (row) => row.id === orderId || row.orderNo === orderId
  );

  if (!order) {
    throw new HttpError(404, "Walk-in order not found.");
  }
  if (!order.isWalkInOrder) {
    throw new HttpError(409, "This order is not a walk-in order.");
  }
  return order;
}

function findCustomerByIdOrThrow(authStore, customerId) {
  const customer = ensureArray(authStore.users).find((row) => row.id === customerId);
  if (!customer) {
    throw new HttpError(404, "Customer not found.");
  }
  ensureCustomerAccountShape(customer);
  return customer;
}

function findExistingCustomerByIdentity(authStore, payload) {
  const normalizedEmail = normalizeEmail(payload.email || "");
  const normalizedMobile = normalizeMobile(payload.mobile || "");

  return ensureArray(authStore.users).find((user) => {
    const emailMatches =
      normalizedEmail && normalizeEmail(user.email || "") === normalizedEmail;
    const mobileMatches =
      normalizedMobile && normalizeMobile(user.mobile || "") === normalizedMobile;
    return emailMatches || mobileMatches;
  }) || null;
}

function createCustomerAddress(payload) {
  return {
    id: generateId("addr"),
    label: "Primary",
    name: payload.name,
    mobile: normalizeMobile(payload.mobile || ""),
    email: normalizeEmail(payload.email || ""),
    addressLine1: payload.addressLine1 || "",
    addressLine2: payload.addressLine2 || "",
    city: payload.city || "",
    state: payload.state || "",
    stateCode: normalizeStateCode(payload.stateCode || ""),
    pincode: String(payload.pincode || "").trim(),
    country: payload.country || "India",
    isDefaultBilling: true,
    isDefaultShipping: true
  };
}

function createWalkInCustomerRecord(authStore, payload) {
  const matched = findExistingCustomerByIdentity(authStore, payload);
  if (matched) {
    ensureCustomerAccountShape(matched);
    return {
      customer: matched,
      created: false
    };
  }

  const now = nowIso();
  const normalizedCustomerType = normalizeCustomerType(payload.customerType);
  const normalizedPriceGroup = normalizePriceGroup(
    payload.priceGroup || (normalizedCustomerType !== "retail" ? normalizedCustomerType : "")
  );
  const customer = {
    id: generateId("user"),
    name: payload.name,
    email: normalizeEmail(payload.email || ""),
    mobile: normalizeMobile(payload.mobile || ""),
    verifiedEmail: false,
    verifiedMobile: false,
    passwordHash: null,
    authProviders: [],
    companyName: payload.companyName || "",
    customerType: normalizedCustomerType,
    priceGroup: normalizedPriceGroup,
    isB2BApproved: normalizedCustomerType !== "retail",
    creditAllowed: Boolean(payload.creditAllowed),
    bankTransferOnly: false,
    pickupAllowed: true,
    orderMode: ORDER_MODES.OFFLINE_REQUEST,
    gstin: normalizeGstin(payload.gstin || ""),
    gstDetails: {
      gstin: normalizeGstin(payload.gstin || ""),
      businessName: payload.companyName || "",
      contactName: payload.name || ""
    },
    savedAddresses: [createCustomerAddress(payload)],
    savedProductIds: [],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };

  ensureCustomerAccountShape(customer);
  authStore.users.push(customer);

  return {
    customer,
    created: true
  };
}

// Standalone customer save, independent of creating an order -- covers the
// case where staff enter a new customer's details but the order itself
// doesn't get finished/confirmed in the same visit. createWalkInOrder
// already persists a customer on every order it creates (paid or not) via
// this same createWalkInCustomerRecord, so this exists purely to let staff
// save the customer explicitly *before* or *without* placing an order.
async function saveWalkInCustomer(payload, actor) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);

  const result = createWalkInCustomerRecord(authStore, payload);
  if (result.created) {
    await writeAuthStore(authStore);
  }

  await addActivityLog({
    action: result.created ? "walkin_orders.customer_created" : "walkin_orders.customer_matched",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "customer",
    resourceId: result.customer.id
  });

  return {
    customer: sanitizeWalkInCustomer(result.customer),
    created: result.created
  };
}

function resolveCustomerForOrder(authStore, payload) {
  if (payload.customerId) {
    return {
      customer: findCustomerByIdOrThrow(authStore, payload.customerId),
      created: false
    };
  }

  return createWalkInCustomerRecord(authStore, payload.customer);
}

function resolveCustomerAddressSnapshot(customer, payload) {
  const primaryAddress = ensureArray(customer.savedAddresses).find(
    (row) => row.isDefaultBilling || row.isDefaultShipping
  ) || ensureArray(customer.savedAddresses)[0] || {};

  return {
    name: payload.name || customer.name || "Customer",
    mobile: normalizeMobile(payload.mobile || customer.mobile || ""),
    email: normalizeEmail(payload.email || customer.email || ""),
    companyName: payload.companyName || customer.companyName || "",
    gstin: normalizeGstin(payload.gstin || customer.gstin || customer.gstDetails?.gstin || ""),
    addressLine1: payload.addressLine1 || primaryAddress.addressLine1 || "",
    addressLine2: payload.addressLine2 || primaryAddress.addressLine2 || "",
    city: payload.city || primaryAddress.city || "",
    state: payload.state || primaryAddress.state || "",
    stateCode: normalizeStateCode(payload.stateCode || primaryAddress.stateCode || ""),
    pincode: String(payload.pincode || primaryAddress.pincode || "").trim(),
    country: payload.country || primaryAddress.country || "India"
  };
}

function findProductOrThrow(catalogStore, productId) {
  const product = ensureArray(catalogStore.products).find((row) => row.id === productId);
  if (!product || !product.isActive) {
    throw new HttpError(404, "One or more selected products are unavailable.");
  }
  return product;
}

function resolvePricingContextForMode(priceMode) {
  if (priceMode === WALKIN_PRICE_MODES.DEALER) {
    return {
      customerId: "",
      customerType: "dealer",
      priceGroup: "dealer",
      isB2BApproved: true
    };
  }

  if (priceMode === WALKIN_PRICE_MODES.STOCKIST) {
    return {
      customerId: "",
      customerType: "stockist",
      priceGroup: "stockist",
      isB2BApproved: true
    };
  }

  return null;
}

function buildWalkInLine(product, input) {
  const qty = Number(input.qty || 0);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpError(400, "Walk-in quantity must be a positive integer.");
  }

  const availableQty = calculateAvailableQty(product);
  if (!product.allowBackorder && qty > availableQty) {
    throw new HttpError(409, `Insufficient stock for '${product.title}'.`);
  }

  let selectedUnitPrice = 0;
  let priceSource = input.priceMode;
  let compareAtUnitPrice = null;

  if (input.priceMode === WALKIN_PRICE_MODES.CUSTOM) {
    selectedUnitPrice = roundMoney(input.customUnitPrice);
    compareAtUnitPrice = roundMoney(
      Number(product.salePrice || 0) > 0 ? product.salePrice : product.basePrice
    );
  } else {
    const pricing = resolveProductUnitPrice(product, {
      qty,
      customerPricingContext: resolvePricingContextForMode(input.priceMode)
    });
    selectedUnitPrice = roundMoney(pricing.unitPrice || 0);
    compareAtUnitPrice =
      pricing.retailDisplayPrice === null || pricing.retailDisplayPrice === undefined
        ? null
        : roundMoney(pricing.retailDisplayPrice);
    priceSource = pricing.priceSource || input.priceMode;
  }

  // Manual, per-line admin discount is applied here, before the line ever
  // reaches calculateWalkInPricing -- that function's existing proportional
  // payment-method discount then runs on top of this already-reduced
  // subtotal unchanged, so the two discount mechanisms stack instead of
  // needing to be reconciled against each other.
  const grossLineSubtotal = roundMoney(selectedUnitPrice * qty);
  const discountPercent = Math.min(100, Math.max(0, Number(input.discountPercent || 0)));
  const manualDiscountAmount =
    discountPercent > 0 ? roundMoney(grossLineSubtotal * (discountPercent / 100)) : 0;
  const lineSubtotal = roundMoney(grossLineSubtotal - manualDiscountAmount);

  return {
    productId: product.id,
    title: product.title,
    sku: product.sku,
    hsnCode: product.hsnCode || "",
    qty,
    gstRate: Number(product.gstRate || 0),
    selectedPriceMode: input.priceMode,
    priceSource,
    compareAtUnitPrice,
    grossLineSubtotal,
    discountPercent,
    lineSubtotal,
    discountAmount: 0,
    taxableValue: lineSubtotal,
    gstAmount: 0,
    lineTotal: lineSubtotal,
    finalUnitPriceAfterDiscount: selectedUnitPrice
  };
}

function buildWalkInLines(catalogStore, items) {
  return items.map((item) => buildWalkInLine(findProductOrThrow(catalogStore, item.productId), item));
}

function calculateWalkInPricing(lines, paymentMethod, shippingCharge, paymentStore) {
  const productSubtotal = roundMoney(
    lines.reduce((sum, line) => sum + Number(line.lineSubtotal || 0), 0)
  );

  const directDiscountPercent = resolveDirectPaymentDiscountPercent(
    paymentMethod,
    paymentStore || {}
  );
  let discountAmount =
    directDiscountPercent > 0
      ? roundMoney(productSubtotal * (Number(directDiscountPercent) / 100))
      : 0;
  if (discountAmount > productSubtotal) {
    discountAmount = productSubtotal;
  }

  let taxableValue = 0;
  let gstTotal = 0;
  let discountLeft = discountAmount;

  const lineCount = lines.length;
  for (let index = 0; index < lineCount; index += 1) {
    const line = lines[index];
    const isLast = index === lineCount - 1;
    const allocatedDiscount =
      productSubtotal <= 0
        ? 0
        : isLast
          ? discountLeft
          : roundMoney((line.lineSubtotal / productSubtotal) * discountAmount);
    const lineDiscount = Math.min(discountLeft, allocatedDiscount);
    discountLeft = roundMoney(discountLeft - lineDiscount);

    line.discountAmount = lineDiscount;
    line.taxableValue = roundMoney(line.lineSubtotal - lineDiscount);
    line.gstAmount = roundMoney(line.taxableValue * (Number(line.gstRate || 0) / 100));
    line.lineTotal = roundMoney(line.taxableValue + line.gstAmount);
    line.finalUnitPriceAfterDiscount = roundMoney(line.taxableValue / line.qty);

    taxableValue = roundMoney(taxableValue + line.taxableValue);
    gstTotal = roundMoney(gstTotal + line.gstAmount);
  }

  const normalizedShippingCharge = roundMoney(shippingCharge);
  const preRoundGrand = roundMoney(taxableValue + gstTotal + normalizedShippingCharge);
  const roundedGrand = Math.round(preRoundGrand);
  const roundOff = roundMoney(roundedGrand - preRoundGrand);
  const grandTotal = roundMoney(preRoundGrand + roundOff);

  return {
    productSubtotal,
    discountAmount,
    taxableValue,
    gstTotal,
    shippingCharge: normalizedShippingCharge,
    roundOff,
    grandTotal
  };
}

function consumeStockForOrder(order, catalogStore) {
  for (const item of ensureArray(order.items)) {
    const productIndex = ensureArray(catalogStore.products).findIndex(
      (product) => product.id === item.productId
    );
    if (productIndex < 0) {
      throw new HttpError(409, `Product '${item.productId}' not found for stock deduction.`);
    }

    const product = catalogStore.products[productIndex];
    const qty = Number(item.qty || 0);
    const availableQty = Number(product.stockQty || 0) - Number(product.reservedQty || 0);
    if (!product.allowBackorder && qty > availableQty) {
      throw new HttpError(409, `Insufficient stock for '${product.title}'.`);
    }
  }

  for (const item of ensureArray(order.items)) {
    const productIndex = ensureArray(catalogStore.products).findIndex(
      (product) => product.id === item.productId
    );
    const product = catalogStore.products[productIndex];
    const qty = Number(item.qty || 0);
    const nextStockQty = Math.max(0, Number(product.stockQty || 0) - qty);
    const remainingAvailable = Math.max(0, nextStockQty - Number(product.reservedQty || 0));

    catalogStore.products[productIndex] = {
      ...product,
      stockQty: nextStockQty,
      stockStatus:
        remainingAvailable <= 0
          ? product.allowBackorder
            ? "backorder"
            : "out_of_stock"
          : remainingAvailable <= Number(product.lowStockThreshold || 0)
            ? "low_stock"
            : "in_stock",
      updatedAt: nowIso()
    };
  }
}

function resolveInitialOrderStatus(payload) {
  if (payload.markAsPaid) {
    return WALKIN_ORDER_STATUSES.PAID;
  }

  if (
    [
      WALKIN_PAYMENT_METHODS.DIRECT_BANK_TRANSFER,
      WALKIN_PAYMENT_METHODS.MANUAL_UPI,
      WALKIN_PAYMENT_METHODS.ONLINE_PAYMENT_LINK,
      WALKIN_PAYMENT_METHODS.CREDIT_PAY_LATER
    ].includes(payload.paymentMethod)
  ) {
    return WALKIN_ORDER_STATUSES.PAYMENT_PENDING;
  }

  return WALKIN_ORDER_STATUSES.WALKIN_ORDER_CREATED;
}

function resolveShipmentStatusForOrderStatus(order, orderStatus) {
  switch (orderStatus) {
    case WALKIN_ORDER_STATUSES.READY_FOR_PICKUP:
      return "ready_for_pickup";
    case WALKIN_ORDER_STATUSES.DISPATCHED:
      return "shipped";
    case WALKIN_ORDER_STATUSES.COMPLETED:
      return order.shippingMethod === SHIPPING_METHODS.SELF_PICKUP
        ? "picked_up"
        : "delivered";
    case WALKIN_ORDER_STATUSES.CANCELLED:
      return "cancelled";
    default:
      return order.shipmentStatus || "pending_packing";
  }
}

function orderMatchesQuery(order, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    order.orderNo,
    order.billingAddress?.name,
    order.billingAddress?.mobile,
    order.billingAddress?.email,
    order.billingAddress?.companyName,
    order.paymentMethod,
    order.gatewayTxnId
  ]
    .filter(Boolean)
    .map(normalizeText)
    .join(" ");

  return haystack.includes(normalizeText(query));
}

function buildOrderListSummary(rows) {
  return rows.reduce(
    (current, row) => ({
      totalCount: current.totalCount + 1,
      unpaidCount: current.unpaidCount + (row.paymentStatus === "pending" ? 1 : 0),
      paidCount: current.paidCount + (row.paymentStatus === "paid" ? 1 : 0),
      invoicePendingCount: current.invoicePendingCount + (row.invoiceId ? 0 : 1)
    }),
    {
      totalCount: 0,
      unpaidCount: 0,
      paidCount: 0,
      invoicePendingCount: 0
    }
  );
}

async function finalizePaidOrder(authStore, catalogStore, order, actor, options = {}) {
  let orderChanged = false;

  if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
    consumeStockForOrder(order, catalogStore);
    order.paymentStatus = "paid";
    order.orderStatus = WALKIN_ORDER_STATUSES.PAID;
    order.paymentVerifiedAt = nowIso();
    order.updatedAt = order.paymentVerifiedAt;
    if (options.paymentReference) {
      order.gatewayTxnId = options.paymentReference;
    }
    orderChanged = true;
    await partnersService.creditPartnerCommissionForOrder(order);
  } else if (options.paymentReference && !order.gatewayTxnId) {
    order.gatewayTxnId = options.paymentReference;
    order.updatedAt = nowIso();
    orderChanged = true;
  }

  if (orderChanged || options.forceCatalogWrite) {
    await Promise.all([writeAuthStore(authStore), writeCatalogStore(catalogStore)]);
  }

  if (!options.generateInvoice) {
    return {
      order,
      invoice: null
    };
  }

  const invoiceResult = await ensureInvoiceForOrder(order.id, actor, {
    source: options.source || "walkin_payment_confirmation",
    invoiceDate: options.invoiceDate
  });

  order.invoiceId = invoiceResult.invoice?.id || order.invoiceId || null;
  order.invoiceNumber = invoiceResult.invoice?.invoiceNumber || order.invoiceNumber || "";
  if (
    ![
      WALKIN_ORDER_STATUSES.READY_FOR_PICKUP,
      WALKIN_ORDER_STATUSES.DISPATCHED,
      WALKIN_ORDER_STATUSES.COMPLETED,
      WALKIN_ORDER_STATUSES.CANCELLED
    ].includes(order.orderStatus)
  ) {
    order.orderStatus = WALKIN_ORDER_STATUSES.INVOICE_GENERATED;
  }
  order.updatedAt = nowIso();
  await writeAuthStore(authStore);

  return {
    order,
    invoice: invoiceResult.invoice
  };
}

async function searchWalkInCustomers(filters) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);

  let rows = [...authStore.users];
  if (filters.q) {
    const query = normalizeText(filters.q);
    rows = rows.filter((user) =>
      [
        user.name,
        user.email,
        user.mobile,
        user.companyName,
        user.gstin,
        user.gstDetails?.gstin
      ]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(query))
    );
  }

  return rows
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt || b.createdAt || "") -
        Date.parse(a.updatedAt || a.createdAt || "")
    )
    .slice(0, Number(filters.limit || 10))
    .map(sanitizeWalkInCustomer);
}

async function searchWalkInProducts(filters) {
  const catalogStore = await readCatalogStore();
  ensureCatalogStoreShape(catalogStore);
  const categoryById = new Map(
    ensureArray(catalogStore.categories).map((row) => [row.id, row.name || ""])
  );

  let rows = ensureArray(catalogStore.products).filter((product) => product.isActive);
  if (filters.categoryId) {
    rows = rows.filter((product) => product.categoryId === filters.categoryId);
  }
  if (filters.q) {
    const query = normalizeText(filters.q);
    rows = rows.filter((product) =>
      [
        product.title,
        product.sku,
        product.brand,
        product.modelNumber,
        product.mpn,
        product.hsnCode
      ]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(query))
    );
  }

  return rows
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, Number(filters.limit || 12))
    .map((product) =>
      sanitizeWalkInProduct(
        {
          ...product,
          availableQty: calculateAvailableQty(product)
        },
        categoryById.get(product.categoryId || "") || ""
      )
    );
}

async function listWalkInCategories() {
  const catalogStore = await readCatalogStore();
  ensureCatalogStoreShape(catalogStore);

  return ensureArray(catalogStore.categories)
    .filter((row) => row.isActive)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((category) => ({
      id: category.id,
      name: category.name,
      parentCategoryId: category.parentCategoryId || null
    }));
}

async function listWalkInOrders(filters) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);

  let rows = ensureArray(authStore.orders).filter((order) => Boolean(order.isWalkInOrder));
  if (filters.status) {
    rows = rows.filter((order) => order.orderStatus === filters.status);
  }
  if (filters.paymentStatus) {
    rows = rows.filter((order) => order.paymentStatus === filters.paymentStatus);
  }
  if (filters.paymentMethod) {
    rows = rows.filter((order) => order.paymentMethod === filters.paymentMethod);
  }
  if (filters.q) {
    rows = rows.filter((order) => orderMatchesQuery(order, filters.q));
  }

  rows = rows.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
  const sliced = rows.slice(0, Number(filters.limit || 50));
  const sanitizedRows = sliced.map(sanitizeWalkInOrderSummary);

  return {
    summary: buildOrderListSummary(sanitizedRows),
    rows: sanitizedRows
  };
}

async function createWalkInOrder(payload, actor) {
  const [authStore, catalogStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readPaymentStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureCatalogStoreShape(catalogStore);
  ensurePaymentStoreShape(paymentStore);

  const customerResolution = resolveCustomerForOrder(authStore, payload);
  const customer = customerResolution.customer;
  const customerPricingContext = buildCustomerPricingContext(customer) || {};

  if (
    payload.paymentMethod === WALKIN_PAYMENT_METHODS.CREDIT_PAY_LATER &&
    !customerPricingContext.creditAllowed
  ) {
    throw new HttpError(409, "Credit / pay-later is allowed only for approved credit customers.");
  }

  const billingAddress = resolveCustomerAddressSnapshot(customer, payload.customer);
  const shippingAddress = { ...billingAddress };
  const lines = buildWalkInLines(catalogStore, payload.items);
  const pricing = calculateWalkInPricing(
    lines,
    payload.paymentMethod,
    payload.shippingMethod === SHIPPING_METHODS.SELF_PICKUP ? 0 : payload.shippingCharge,
    paymentStore
  );

  const now = nowIso();
  const order = {
    id: generateId("order"),
    orderNo: generateWalkInOrderNo(authStore),
    checkoutSessionId: null,
    ownerType: "customer",
    ownerId: customer.id,
    userId: customer.id,
    customerType: customerPricingContext.customerType || "retail",
    priceGroup: customerPricingContext.priceGroup || "",
    isB2BApproved: Boolean(customerPricingContext.isB2BApproved),
    companyName: billingAddress.companyName || customer.companyName || "",
    gstin: billingAddress.gstin || "",
    creditAllowed: Boolean(customerPricingContext.creditAllowed),
    bankTransferOnly: Boolean(customerPricingContext.bankTransferOnly),
    pickupAllowed: Boolean(customerPricingContext.pickupAllowed),
    orderMode: ORDER_MODES.OFFLINE_REQUEST,
    isB2BOrderRequest: false,
    isWalkInOrder: true,
    orderSource: "admin_walkin",
    createdByAdminId: actor.id,
    createdByAdminRole: actor.role,
    items: lines.map((line) => ({
      productId: line.productId,
      title: line.title,
      sku: line.sku,
      hsnCode: line.hsnCode || "",
      qty: line.qty,
      finalUnitPrice: line.finalUnitPriceAfterDiscount,
      priceSource: line.priceSource,
      selectedPriceMode: line.selectedPriceMode,
      compareAtUnitPrice: line.compareAtUnitPrice,
      bulkApplied: false,
      bulkRule: null,
      // discountPercent is the admin-entered manual discount; discountAmount
      // is the TOTAL discount (manual + the proportional auto payment-method
      // discount computed by calculateWalkInPricing) relative to the gross,
      // pre-discount subtotal -- matches how discountAmount is shown per-line
      // on invoices/order-detail elsewhere in the app.
      discountPercent: line.discountPercent || 0,
      discountAmount: roundMoney((line.grossLineSubtotal || line.lineSubtotal) - line.taxableValue),
      gstRate: line.gstRate,
      taxableValue: line.taxableValue,
      gstAmount: line.gstAmount,
      lineTotal: line.lineTotal,
      shippingClass: line.shippingClass || "normal"
    })),
    productSubtotal: pricing.productSubtotal,
    discountAmount: pricing.discountAmount,
    taxableValue: pricing.taxableValue,
    gstTotal: pricing.gstTotal,
    shippingCharge: pricing.shippingCharge,
    roundOff: pricing.roundOff,
    grandTotal: pricing.grandTotal,
    paymentStatus: "pending",
    orderStatus: resolveInitialOrderStatus(payload),
    shipmentStatus: "pending_packing",
    invoiceId: null,
    invoiceNumber: "",
    paymentMethod: payload.paymentMethod,
    shippingMethod: payload.shippingMethod,
    billingAddress,
    shippingAddress,
    manualPaymentStatus: payload.markAsPaid ? "received" : "",
    paymentVerifiedAt: null,
    gatewayTxnId: payload.paymentReference || "",
    orderNote: payload.orderNote || "",
    fulfilmentUpdatedAt: null,
    createdAt: now,
    updatedAt: now
  };

  authStore.orders.push(order);

  let invoice = null;
  if (payload.markAsPaid) {
    const result = await finalizePaidOrder(authStore, catalogStore, order, actor, {
      generateInvoice: payload.generateInvoice !== false,
      paymentReference: payload.paymentReference || "",
      source: "walkin_order_create",
      forceCatalogWrite: true
    });
    invoice = result.invoice;
  } else {
    await writeAuthStore(authStore);

    // Unpaid walk-in orders previously got NO invoice at all until payment
    // was confirmed -- but B2B customers often need a Proforma Invoice up
    // front to route through their own company's purchase-approval process.
    // ensureInvoiceForOrder already derives documentType purely from
    // order.paymentStatus (buildInvoiceDocument in invoices.service.js), so
    // calling it here with the order still "pending" naturally produces a
    // Proforma; confirmWalkInPayment's later call to the same function
    // re-derives "tax_invoice" once paymentStatus flips to "paid" -- no
    // separate proforma/tax-invoice branching needed here.
    if (payload.generateInvoice !== false) {
      const invoiceResult = await ensureInvoiceForOrder(order.id, actor, {
        source: "walkin_order_create_proforma"
      });
      order.invoiceId = invoiceResult.invoice?.id || null;
      order.invoiceNumber = invoiceResult.invoice?.invoiceNumber || "";
      order.updatedAt = nowIso();
      await writeAuthStore(authStore);
      invoice = invoiceResult.invoice;
    }
  }

  await addActivityLog({
    action: "walkin_orders.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderNo: order.orderNo,
      customerId: customer.id
    }
  });

  return {
    customer: sanitizeWalkInCustomer(customer),
    order: sanitizeWalkInOrderSummary(order),
    invoice
  };
}

// Edits an existing walk-in order's customer/items/pricing in place -- only
// while it's still unpaid (mirrors the "remains a Proforma Invoice until
// payment is confirmed" rule: the order stays fully editable up to that
// point, then locks). If a Proforma was already generated, it's superseded
// with a fresh one reflecting the edited totals so what gets sent/shown to
// the customer next never goes stale after an edit.
async function updateWalkInOrder(orderId, payload, actor) {
  const [authStore, catalogStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readPaymentStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureCatalogStoreShape(catalogStore);
  ensurePaymentStoreShape(paymentStore);

  const order = findWalkInOrderOrThrow(authStore, orderId);

  if (String(order.paymentStatus || "").toLowerCase() === "paid") {
    throw new HttpError(409, "Paid orders cannot be edited.");
  }
  if (order.orderStatus === WALKIN_ORDER_STATUSES.CANCELLED) {
    throw new HttpError(409, "Cancelled orders cannot be edited.");
  }

  const customerResolution = resolveCustomerForOrder(authStore, payload);
  const customer = customerResolution.customer;
  const customerPricingContext = buildCustomerPricingContext(customer) || {};

  if (
    payload.paymentMethod === WALKIN_PAYMENT_METHODS.CREDIT_PAY_LATER &&
    !customerPricingContext.creditAllowed
  ) {
    throw new HttpError(409, "Credit / pay-later is allowed only for approved credit customers.");
  }

  const billingAddress = resolveCustomerAddressSnapshot(customer, payload.customer);
  const shippingAddress = { ...billingAddress };
  const lines = buildWalkInLines(catalogStore, payload.items);
  const pricing = calculateWalkInPricing(
    lines,
    payload.paymentMethod,
    payload.shippingMethod === SHIPPING_METHODS.SELF_PICKUP ? 0 : payload.shippingCharge,
    paymentStore
  );

  order.ownerId = customer.id;
  order.userId = customer.id;
  order.customerType = customerPricingContext.customerType || "retail";
  order.priceGroup = customerPricingContext.priceGroup || "";
  order.isB2BApproved = Boolean(customerPricingContext.isB2BApproved);
  order.companyName = billingAddress.companyName || customer.companyName || "";
  order.gstin = billingAddress.gstin || "";
  order.creditAllowed = Boolean(customerPricingContext.creditAllowed);
  order.bankTransferOnly = Boolean(customerPricingContext.bankTransferOnly);
  order.pickupAllowed = Boolean(customerPricingContext.pickupAllowed);
  order.items = lines.map((line) => ({
    productId: line.productId,
    title: line.title,
    sku: line.sku,
    hsnCode: line.hsnCode || "",
    qty: line.qty,
    finalUnitPrice: line.finalUnitPriceAfterDiscount,
    priceSource: line.priceSource,
    selectedPriceMode: line.selectedPriceMode,
    compareAtUnitPrice: line.compareAtUnitPrice,
    bulkApplied: false,
    bulkRule: null,
    discountPercent: line.discountPercent || 0,
    discountAmount: roundMoney((line.grossLineSubtotal || line.lineSubtotal) - line.taxableValue),
    gstRate: line.gstRate,
    taxableValue: line.taxableValue,
    gstAmount: line.gstAmount,
    lineTotal: line.lineTotal,
    shippingClass: line.shippingClass || "normal"
  }));
  order.productSubtotal = pricing.productSubtotal;
  order.discountAmount = pricing.discountAmount;
  order.taxableValue = pricing.taxableValue;
  order.gstTotal = pricing.gstTotal;
  order.shippingCharge = pricing.shippingCharge;
  order.roundOff = pricing.roundOff;
  order.grandTotal = pricing.grandTotal;
  order.orderStatus = resolveInitialOrderStatus({
    markAsPaid: false,
    paymentMethod: payload.paymentMethod
  });
  order.paymentMethod = payload.paymentMethod;
  order.shippingMethod = payload.shippingMethod;
  order.billingAddress = billingAddress;
  order.shippingAddress = shippingAddress;
  order.gatewayTxnId = payload.paymentReference || "";
  order.orderNote = payload.orderNote || "";
  order.updatedAt = nowIso();

  const hadInvoice = Boolean(order.invoiceId);
  await writeAuthStore(authStore);

  let invoice = null;
  if (hadInvoice) {
    const invoiceResult = await ensureInvoiceForOrder(order.id, actor, {
      source: "walkin_order_edit_proforma",
      forceRegenerate: true
    });
    order.invoiceId = invoiceResult.invoice?.id || null;
    order.invoiceNumber = invoiceResult.invoice?.invoiceNumber || "";
    order.updatedAt = nowIso();
    await writeAuthStore(authStore);
    invoice = invoiceResult.invoice;
  }

  await addActivityLog({
    action: "walkin_orders.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderNo: order.orderNo
    }
  });

  return {
    customer: sanitizeWalkInCustomer(customer),
    order: sanitizeWalkInOrderSummary(order),
    invoice
  };
}

async function confirmWalkInPayment(orderId, payload, actor) {
  const [authStore, catalogStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureCatalogStoreShape(catalogStore);
  const order = findWalkInOrderOrThrow(authStore, orderId);

  if (order.orderStatus === WALKIN_ORDER_STATUSES.CANCELLED) {
    throw new HttpError(409, "Cancelled walk-in orders cannot be marked as paid.");
  }

  const result = await finalizePaidOrder(authStore, catalogStore, order, actor, {
    generateInvoice: payload.generateInvoice !== false,
    paymentReference: payload.paymentReference || "",
    source: "walkin_payment_confirmation"
  });

  await addActivityLog({
    action: "walkin_orders.payment_confirmed",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderNo: order.orderNo
    }
  });

  return {
    order: sanitizeWalkInOrderSummary(result.order),
    invoice: result.invoice
  };
}

function escapeHtmlForWalkInEmail(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatInrForWalkInEmail(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function buildWalkInItemsEmailTable(items) {
  const rows = ensureArray(items)
    .map(
      (item) =>
        `<tr>` +
        `<td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;">${escapeHtmlForWalkInEmail(item.title || item.productId)}</td>` +
        `<td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:center;">${Number(item.qty || 0)}</td>` +
        `<td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatInrForWalkInEmail(item.finalUnitPrice)}</td>` +
        `<td style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatInrForWalkInEmail(item.lineTotal)}</td>` +
        `</tr>`
    )
    .join("");

  return (
    `<table style="width:100%;font-size:13px;border-collapse:collapse;margin:12px 0;">` +
    `<thead><tr style="background:#f9fafb;">` +
    `<th style="padding:8px 6px;text-align:left;border-bottom:2px solid #e5e7eb;">Product</th>` +
    `<th style="padding:8px 6px;text-align:center;border-bottom:2px solid #e5e7eb;">Qty</th>` +
    `<th style="padding:8px 6px;text-align:right;border-bottom:2px solid #e5e7eb;">Unit Price</th>` +
    `<th style="padding:8px 6px;text-align:right;border-bottom:2px solid #e5e7eb;">Amount</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}

// Pulled directly from storeProfile rather than a payment-gateway config --
// walk-in orders can be on cash/cheque/credit as well as bank/UPI, so this
// is a simpler, always-available fallback rather than requiring a manual
// gateway to be configured.
function buildWalkInPaymentInstructionsText(storeProfile) {
  const lines = [];
  if (storeProfile.accountHolderName) lines.push(`Account Holder: ${storeProfile.accountHolderName}`);
  if (storeProfile.bankName) lines.push(`Bank: ${storeProfile.bankName}`);
  if (storeProfile.accountNumber) lines.push(`Account No.: ${storeProfile.accountNumber}`);
  if (storeProfile.ifsc) lines.push(`IFSC: ${storeProfile.ifsc}`);
  if (storeProfile.upiId) lines.push(`UPI ID: ${storeProfile.upiId}`);
  return lines.length > 0 ? lines.join("\n") : "Contact us for payment details.";
}

// Ensures the order has a Proforma Invoice (generating one if it doesn't
// yet -- e.g. generateInvoice was unchecked at creation) and emails +
// WhatsApps the customer a payment request referencing it. Distinct from
// manual-payments.service.js's demandManualPayment: that one is WhatsApp-
// only and gated to direct_bank_transfer/manual_upi orders specifically;
// this covers any unpaid walk-in order (cash, cheque, credit/pay-later,
// online link) and always sends both channels, per the explicit ask for
// an email with a specific subject line alongside WhatsApp.
async function sendWalkInPaymentRequest(orderId, actor) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const order = findWalkInOrderOrThrow(authStore, orderId);

  if (String(order.paymentStatus || "").toLowerCase() === "paid") {
    throw new HttpError(409, "This order is already paid.");
  }

  let invoice = null;
  if (!order.invoiceId) {
    const invoiceResult = await ensureInvoiceForOrder(order.id, actor, {
      source: "walkin_payment_request"
    });
    order.invoiceId = invoiceResult.invoice?.id || null;
    order.invoiceNumber = invoiceResult.invoice?.invoiceNumber || "";
    order.updatedAt = nowIso();
    await writeAuthStore(authStore);
    invoice = invoiceResult.invoice;
  }

  const toEmail = order.billingAddress?.email || "";
  const toMobile = order.billingAddress?.mobile || "";
  if (!toEmail && !toMobile) {
    throw new HttpError(400, "Customer has no email or mobile number on file to send this to.");
  }

  const settings = await getAllSettings();
  const orderTotal = formatInrForWalkInEmail(order.grandTotal);
  const paymentInstructions = buildWalkInPaymentInstructionsText(settings.storeProfile || {});

  const result = await notifyCustomerEvent({
    eventKey: "walkin_payment_request",
    toEmail,
    toMobile,
    relatedResourceType: "order",
    relatedResourceId: order.id,
    variables: {
      customerName: order.billingAddress?.name || order.companyName || "Customer",
      orderNo: order.orderNo || "",
      invoiceNo: order.invoiceNumber || invoice?.invoiceNumber || "",
      itemsTable: buildWalkInItemsEmailTable(order.items),
      orderTotal,
      paymentInstructions
    }
  });

  order.lastPaymentRequestAt = nowIso();
  order.updatedAt = order.lastPaymentRequestAt;
  await writeAuthStore(authStore);

  await addActivityLog({
    action: "walkin_orders.payment_request_sent",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderNo: order.orderNo,
      toEmail: Boolean(toEmail),
      toMobile: Boolean(toMobile)
    }
  });

  return {
    order: sanitizeWalkInOrderSummary(order),
    invoice,
    emailResult: result?.email || null,
    whatsappResult: result?.whatsapp || null
  };
}

async function generateWalkInInvoice(orderId, payload, actor) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const order = findWalkInOrderOrThrow(authStore, orderId);

  const invoiceResult = await ensureInvoiceForOrder(order.id, actor, {
    source: "walkin_invoice_generation",
    invoiceDate: payload.invoiceDate
  });

  order.invoiceId = invoiceResult.invoice?.id || order.invoiceId || null;
  order.invoiceNumber = invoiceResult.invoice?.invoiceNumber || order.invoiceNumber || "";
  if (
    ![
      WALKIN_ORDER_STATUSES.READY_FOR_PICKUP,
      WALKIN_ORDER_STATUSES.DISPATCHED,
      WALKIN_ORDER_STATUSES.COMPLETED,
      WALKIN_ORDER_STATUSES.CANCELLED
    ].includes(order.orderStatus)
  ) {
    order.orderStatus = WALKIN_ORDER_STATUSES.INVOICE_GENERATED;
  }
  order.updatedAt = nowIso();
  await writeAuthStore(authStore);

  await addActivityLog({
    action: "walkin_orders.invoice_generated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderNo: order.orderNo,
      invoiceNumber: invoiceResult.invoice?.invoiceNumber || ""
    }
  });

  return {
    order: sanitizeWalkInOrderSummary(order),
    invoice: invoiceResult.invoice
  };
}

async function updateWalkInOrderStatus(orderId, payload, actor) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const order = findWalkInOrderOrThrow(authStore, orderId);

  if (payload.orderStatus !== WALKIN_ORDER_STATUSES.CANCELLED) {
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
      throw new HttpError(409, "Only paid walk-in orders can move into fulfilment statuses.");
    }
    if (!order.invoiceId) {
      throw new HttpError(409, "Generate the invoice before fulfilment updates.");
    }
  }

  if (
    payload.orderStatus === WALKIN_ORDER_STATUSES.READY_FOR_PICKUP &&
    order.shippingMethod !== SHIPPING_METHODS.SELF_PICKUP
  ) {
    throw new HttpError(409, "Ready for pickup is only valid for self-pickup orders.");
  }

  if (
    payload.orderStatus === WALKIN_ORDER_STATUSES.DISPATCHED &&
    order.shippingMethod === SHIPPING_METHODS.SELF_PICKUP
  ) {
    throw new HttpError(409, "Self-pickup walk-in orders cannot be marked as dispatched.");
  }

  if (
    payload.orderStatus === WALKIN_ORDER_STATUSES.CANCELLED &&
    order.orderStatus === WALKIN_ORDER_STATUSES.COMPLETED
  ) {
    throw new HttpError(409, "Completed walk-in orders cannot be cancelled.");
  }

  order.orderStatus = payload.orderStatus;
  order.shipmentStatus = resolveShipmentStatusForOrderStatus(order, payload.orderStatus);
  order.adminStatusNote = payload.adminNote || "";
  order.fulfilmentUpdatedAt = nowIso();
  order.updatedAt = order.fulfilmentUpdatedAt;

  await writeAuthStore(authStore);

  await addActivityLog({
    action: "walkin_orders.status_updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderNo: order.orderNo,
      orderStatus: payload.orderStatus
    }
  });

  return {
    order: sanitizeWalkInOrderSummary(order)
  };
}

module.exports = {
  searchWalkInCustomers,
  searchWalkInProducts,
  listWalkInCategories,
  listWalkInOrders,
  createWalkInOrder,
  updateWalkInOrder,
  confirmWalkInPayment,
  generateWalkInInvoice,
  updateWalkInOrderStatus,
  saveWalkInCustomer,
  sendWalkInPaymentRequest
};
