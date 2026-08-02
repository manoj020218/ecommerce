const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { readInvoiceStore } = require("../../database/invoice-store");
const { readPaymentStore } = require("../../database/payment-store");
const { readShippingStore } = require("../../database/shipping-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { PAYMENT_METHODS } = require("../cart-checkout/cart-checkout.model");
const { getCart } = require("../cart-checkout/cart-checkout.service");
const { getInvoiceDownload } = require("../invoices/invoices.service");
const {
  getManualPaymentInstructions
} = require("../payment-gateways/payment-gateways.model");
const { toPublicProductCard } = require("../products/products.model");
const {
  listCustomerSearchHistory,
  listCustomerViewedHistory
} = require("../search/search.service");
const { getPublicSettingsBundle } = require("../settings/settings.service");
const {
  B2B_ORDER_STATUSES,
  buildCustomerPricingContext
} = require("../customers/customers.model");
const {
  REORDER_MODES,
  ensureArray,
  ensureCustomerAccountShape,
  sanitizeCustomerAddress,
  sanitizeGstDetails,
  sanitizeCustomerAccountProfile
} = require("./customer-account.model");

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeMobile(value) {
  return String(value || "")
    .trim();
}

function normalizeStateCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function resolveOrderShippingQuery(order) {
  const shippingAddress = order?.shippingAddress || {};
  const billingAddress = order?.billingAddress || {};

  return {
    paymentMethod: order?.paymentMethod || undefined,
    shippingMethod: order?.shippingMethod || undefined,
    shippingPincode: shippingAddress.pincode || billingAddress.pincode || undefined,
    shippingStateCode:
      shippingAddress.stateCode || billingAddress.stateCode || undefined,
    shippingState: shippingAddress.state || billingAddress.state || undefined
  };
}

function ensureAuthStoreShape(store) {
  let changed = false;

  if (!Array.isArray(store.users)) {
    store.users = [];
    changed = true;
  }
  if (!Array.isArray(store.orders)) {
    store.orders = [];
    changed = true;
  }
  if (!Array.isArray(store.userCarts)) {
    store.userCarts = [];
    changed = true;
  }

  for (const user of store.users) {
    if (ensureCustomerAccountShape(user)) {
      changed = true;
    }
  }

  return changed;
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
}

function findCustomerOrThrow(authStore, customerId) {
  const customer = ensureArray(authStore.users).find((user) => user.id === customerId);
  if (!customer) {
    throw new HttpError(404, "Customer account not found.");
  }
  ensureCustomerAccountShape(customer);
  return customer;
}

function findOrderByIdOrNo(authStore, orderId) {
  return ensureArray(authStore.orders).find(
    (order) => order.id === orderId || order.orderNo === orderId
  );
}

function isOrderAccessible(order, customerId) {
  if (!order) {
    return false;
  }
  if (order.userId && order.userId === customerId) {
    return true;
  }
  if (order.ownerType === "customer" && order.ownerId === customerId) {
    return true;
  }
  return false;
}

function findAccessibleOrderOrThrow(authStore, customerId, orderId) {
  const order = findOrderByIdOrNo(authStore, orderId);
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  if (!isOrderAccessible(order, customerId)) {
    throw new HttpError(403, "You are not allowed to access this order.");
  }
  return order;
}

function buildLatestShipmentMap(shippingStore) {
  const map = new Map();

  for (const shipment of ensureArray(shippingStore.shipments)) {
    const current = map.get(shipment.orderId);
    if (!current) {
      map.set(shipment.orderId, shipment);
      continue;
    }

    const currentTs = Date.parse(current.updatedAt || current.createdAt || "");
    const nextTs = Date.parse(shipment.updatedAt || shipment.createdAt || "");
    if (nextTs >= currentTs) {
      map.set(shipment.orderId, shipment);
    }
  }

  return map;
}

function buildInvoiceByOrderIdMap(invoiceStore) {
  const map = new Map();
  for (const invoice of ensureArray(invoiceStore.invoices)) {
    if (!map.has(invoice.orderId)) {
      map.set(invoice.orderId, invoice);
    }
  }
  return map;
}

function resolveInvoiceStatus(order, invoice) {
  if (invoice || order.invoiceId) {
    return "generated";
  }
  return "pending";
}

function buildBulkPriceMessage(item) {
  if (!item.bulkApplied || !item.bulkRule) {
    return "";
  }
  return `Bulk price applied from qty ${Number(item.bulkRule.minQty || 0)}.`;
}

function buildShipmentTimeline(order, shipment) {
  const timeline = [];

  timeline.push({
    code: "order_placed",
    label: "Order placed",
    at: order.createdAt || null,
    description: `Order ${order.orderNo || order.id} was created.`
  });

  if (order.isB2BOrderRequest) {
    timeline.push({
      code: B2B_ORDER_STATUSES.ORDER_REQUEST_RECEIVED,
      label: "Order request received",
      at: order.orderRequestReceivedAt || order.createdAt || null,
      description: "Offline dealer order request was submitted for admin review."
    });

    timeline.push({
      code: B2B_ORDER_STATUSES.AWAITING_ADMIN_APPROVAL,
      label: "Awaiting admin approval",
      at: order.orderRequestReceivedAt || order.createdAt || null,
      description: "Request is waiting for admin approval before payment collection."
    });
  }

  if (order.approvedAt) {
    timeline.push({
      code: B2B_ORDER_STATUSES.AWAITING_BANK_PAYMENT,
      label: "Awaiting bank payment",
      at: order.approvedAt,
      description: "Admin approved the order and requested offline payment proof."
    });
  }

  if (order.manualPaymentSubmittedAt) {
    timeline.push({
      code: "manual_payment_submitted",
      label: "Manual payment submitted",
      at: order.manualPaymentSubmittedAt,
      description: "Payment proof is pending admin verification."
    });
  }

  if (order.paymentVerifiedAt) {
    timeline.push({
      code: order.isB2BOrderRequest
        ? B2B_ORDER_STATUSES.PAYMENT_RECEIVED
        : "payment_confirmed",
      label: order.isB2BOrderRequest ? "Payment received" : "Payment confirmed",
      at: order.paymentVerifiedAt,
      description: `Payment status: ${order.paymentStatus || "paid"}.`
    });
  }

  if (
    [
      B2B_ORDER_STATUSES.PACKING_STARTED,
      B2B_ORDER_STATUSES.READY_FOR_PICKUP,
      B2B_ORDER_STATUSES.DISPATCHED,
      B2B_ORDER_STATUSES.DELIVERED,
      B2B_ORDER_STATUSES.PICKED_UP,
      B2B_ORDER_STATUSES.COMPLETED,
      B2B_ORDER_STATUSES.CANCELLED
    ].includes(order.orderStatus)
  ) {
    timeline.push({
      code: order.orderStatus,
      label: order.orderStatus.replace(/_/g, " "),
      at: order.fulfilmentUpdatedAt || order.updatedAt || order.paymentVerifiedAt || null,
      description: `Order status is now ${order.orderStatus.replace(/_/g, " ")}.`
    });
  }

  if (!shipment) {
    return timeline.sort((a, b) => Date.parse(a.at || "") - Date.parse(b.at || ""));
  }

  timeline.push({
    code: "shipment_created",
    label: "Shipment created",
    at: shipment.createdAt || shipment.updatedAt || null,
    description: shipment.courierName
      ? `Shipment assigned to ${shipment.courierName}.`
      : "Shipment record created."
  });

  if (shipment.dispatchDate) {
    timeline.push({
      code: "shipped",
      label: "Dispatched",
      at: shipment.dispatchDate,
      description: shipment.trackingId
        ? `Tracking ID ${shipment.trackingId} created.`
        : "Shipment dispatched."
    });
  }

  if (
    ["in_transit", "out_for_delivery", "delivered", "delivery_failed", "returned"].includes(
      shipment.shipmentStatus
    )
  ) {
    timeline.push({
      code: shipment.shipmentStatus,
      label: shipment.shipmentStatus.replace(/_/g, " "),
      at: shipment.updatedAt || shipment.dispatchDate || null,
      description: shipment.expectedDeliveryDate
        ? `Expected delivery ${shipment.expectedDeliveryDate}.`
        : "Shipment status updated."
    });
  }

  if (shipment.deliveredAt) {
    timeline.push({
      code: "delivered",
      label: "Delivered",
      at: shipment.deliveredAt,
      description: shipment.podStatus === "uploaded" ? "Proof of delivery uploaded." : "Delivered."
    });
  }

  return timeline.sort((a, b) => Date.parse(a.at || "") - Date.parse(b.at || ""));
}

function buildOrderSummary(order, shipment, invoice) {
  return {
    id: order.id,
    orderNo: order.orderNo || "",
    orderDate: order.createdAt || null,
    orderTotal: Number(order.grandTotal || 0),
    paymentStatus: order.paymentStatus || "",
    orderStatus: order.orderStatus || "",
    manualPaymentStatus: order.manualPaymentStatus || "",
    invoiceStatus: resolveInvoiceStatus(order, invoice),
    invoiceId: invoice?.id || order.invoiceId || null,
    invoiceNumber: invoice?.invoiceNumber || order.invoiceNumber || "",
    shipmentStatus: shipment?.shipmentStatus || order.shipmentStatus || "pending_packing",
    courierName: shipment?.courierName || "",
    trackingId: shipment?.trackingId || "",
    trackingUrl: shipment?.trackingUrl || "",
    paymentMethod: order.paymentMethod || "",
    customerType: order.customerType || "retail",
    priceGroup: order.priceGroup || "",
    isB2BOrderRequest: Boolean(order.isB2BOrderRequest)
  };
}

function buildOrderDetail(order, shipment, invoice, options = {}) {
  return {
    ...buildOrderSummary(order, shipment, invoice),
    billingAddress: order.billingAddress || {},
    shippingAddress: order.shippingAddress || {},
    items: ensureArray(order.items).map((item) => ({
      productId: item.productId,
      title: item.title,
      sku: item.sku || "",
      hsnCode: item.hsnCode || "",
      qty: Number(item.qty || 0),
      unitPriceUsed: Number(item.finalUnitPrice || 0),
      bulkApplied: Boolean(item.bulkApplied),
      bulkPriceMessage: buildBulkPriceMessage(item),
      gstRate: Number(item.gstRate || 0),
      taxableValue: Number(item.taxableValue || 0),
      gstAmount: Number(item.gstAmount || 0),
      lineTotal: Number(item.lineTotal || 0)
    })),
    pricing: {
      productSubtotal: Number(order.productSubtotal || 0),
      discountAmount: Number(order.discountAmount || 0),
      taxableValue: Number(order.taxableValue || 0),
      gstTotal: Number(order.gstTotal || 0),
      shippingCharge: Number(order.shippingCharge || 0),
      roundOff: Number(order.roundOff || 0),
      grandTotal: Number(order.grandTotal || 0)
    },
    invoice:
      invoice === undefined || invoice === null
        ? null
        : {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate
          },
    trackingDetails:
      shipment === undefined || shipment === null
        ? null
        : {
            shipmentId: shipment.id,
            courierName: shipment.courierName || "",
            courierCode: shipment.courierCode || "",
            trackingId: shipment.trackingId || "",
            trackingUrl: shipment.trackingUrl || "",
            shipmentStatus: shipment.shipmentStatus || "",
            dispatchDate: shipment.dispatchDate || "",
            expectedDeliveryDate: shipment.expectedDeliveryDate || "",
            deliveredAt: shipment.deliveredAt || "",
            podStatus: shipment.podStatus || "pending",
            podFileUrl: shipment.podFileUrl || ""
          },
    shipmentTimeline: buildShipmentTimeline(order, shipment),
    manualPaymentInstructions: options.manualPaymentInstructions || null
  };
}

function buildInvoiceSummary(invoice, order, shipment) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    orderId: order.id,
    orderNo: order.orderNo || "",
    grandTotal: Number(invoice.pricing?.grandTotal || order.grandTotal || 0),
    paymentStatus: invoice.paymentStatus || order.paymentStatus || "",
    shipmentStatus: shipment?.shipmentStatus || order.shipmentStatus || "pending_packing"
  };
}

function buildTrackingSummary(order, shipment, invoice) {
  return {
    orderId: order.id,
    orderNo: order.orderNo || "",
    invoiceId: invoice?.id || order.invoiceId || null,
    shipmentStatus: shipment?.shipmentStatus || order.shipmentStatus || "pending_packing",
    courierName: shipment?.courierName || "",
    trackingId: shipment?.trackingId || "",
    trackingUrl: shipment?.trackingUrl || "",
    expectedDeliveryDate: shipment?.expectedDeliveryDate || "",
    deliveredAt: shipment?.deliveredAt || ""
  };
}

function buildSavedProducts(customer, catalogStore) {
  const customerPricingContext = buildCustomerPricingContext(customer);
  const byId = new Map(
    ensureArray(catalogStore.products)
      .filter((product) => product.isActive)
      .map((product) => [product.id, product])
  );

  return ensureArray(customer.savedProductIds)
    .map((productId) => byId.get(productId))
    .filter(Boolean)
    .map((product) =>
      toPublicProductCard(product, {
        customerPricingContext
      })
    );
}

function resolveOrderContact(order) {
  const billingAddress = order.billingAddress || {};
  const shippingAddress = order.shippingAddress || {};

  return {
    email:
      normalizeEmail(
        billingAddress.email || shippingAddress.email || billingAddress.contactEmail || ""
      ),
    mobile: normalizeMobile(
      billingAddress.mobile ||
        shippingAddress.mobile ||
        billingAddress.contactMobile ||
        ""
    )
  };
}

function buildSupportInfo(settingsBundle) {
  return {
    storeName: settingsBundle?.storeProfile?.storeName || "Jenix India",
    supportEmail:
      settingsBundle?.contactInformation?.publicEmail ||
      settingsBundle?.storeProfile?.supportEmail ||
      "",
    supportPhone:
      settingsBundle?.contactInformation?.publicPhone ||
      settingsBundle?.storeProfile?.supportMobile ||
      "",
    supportWhatsApp: settingsBundle?.contactInformation?.publicWhatsApp || "",
    supportTiming: settingsBundle?.contactInformation?.supportTiming || "",
    googleMapLink: settingsBundle?.contactInformation?.googleMapLink || ""
  };
}

async function persistAuthStore(authStore) {
  await writeAuthStore(authStore);
}

async function getCustomerAccountBootstrap(customerId, query) {
  const [
    authStore,
    catalogStore,
    invoiceStore,
    shippingStore,
    settingsBundle,
    recentSearches,
    recentlyViewed
  ] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readInvoiceStore(),
    readShippingStore(),
    getPublicSettingsBundle(),
    listCustomerSearchHistory(customerId, Number(query.historyLimit || 6)),
    listCustomerViewedHistory(customerId, Number(query.historyLimit || 6))
  ]);

  const changed = ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensureShippingStoreShape(shippingStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  const latestShipmentByOrderId = buildLatestShipmentMap(shippingStore);
  const invoiceByOrderId = buildInvoiceByOrderIdMap(invoiceStore);
  const accessibleOrders = ensureArray(authStore.orders)
    .filter((order) => isOrderAccessible(order, customerId))
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  if (changed) {
    await persistAuthStore(authStore);
  }

  return {
    profile: sanitizeCustomerAccountProfile(customer),
    recentOrders: accessibleOrders
      .slice(0, Number(query.historyLimit || 6))
      .map((order) =>
        buildOrderSummary(
          order,
          latestShipmentByOrderId.get(order.id),
          invoiceByOrderId.get(order.id)
        )
      ),
    recentInvoices: accessibleOrders
      .filter((order) => invoiceByOrderId.has(order.id))
      .slice(0, Number(query.historyLimit || 6))
      .map((order) =>
        buildInvoiceSummary(
          invoiceByOrderId.get(order.id),
          order,
          latestShipmentByOrderId.get(order.id)
        )
      ),
    tracking: accessibleOrders
      .filter((order) => latestShipmentByOrderId.has(order.id))
      .slice(0, Number(query.historyLimit || 6))
      .map((order) =>
        buildTrackingSummary(
          order,
          latestShipmentByOrderId.get(order.id),
          invoiceByOrderId.get(order.id)
        )
      ),
    savedAddresses: ensureArray(customer.savedAddresses).map(sanitizeCustomerAddress),
    gstDetails: sanitizeGstDetails(customer.gstDetails),
    recentlyViewed,
    recentSearches,
    savedProducts: buildSavedProducts(customer, catalogStore),
    support: buildSupportInfo(settingsBundle)
  };
}

async function updateCustomerProfile(customerId, patch) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  if (patch.name !== undefined) {
    customer.name = patch.name;
  }
  if (patch.companyName !== undefined) {
    customer.companyName = patch.companyName || "";
  }
  if (patch.newsletterSubscribed !== undefined) {
    customer.newsletterSubscribed = Boolean(patch.newsletterSubscribed);
  }
  customer.updatedAt = nowIso();

  await persistAuthStore(authStore);

  await addActivityLog({
    action: "customer_account.profile.updated",
    actorId: customerId,
    actorRole: "customer",
    resourceType: "customer_profile",
    resourceId: customerId
  });

  return sanitizeCustomerAccountProfile(customer);
}

async function listCustomerOrders(customerId, filters) {
  const [authStore, invoiceStore, shippingStore] = await Promise.all([
    readAuthStore(),
    readInvoiceStore(),
    readShippingStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensureShippingStoreShape(shippingStore);
  findCustomerOrThrow(authStore, customerId);

  const latestShipmentByOrderId = buildLatestShipmentMap(shippingStore);
  const invoiceByOrderId = buildInvoiceByOrderIdMap(invoiceStore);

  return ensureArray(authStore.orders)
    .filter((order) => isOrderAccessible(order, customerId))
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, Number(filters.limit || 50))
    .map((order) =>
      buildOrderSummary(
        order,
        latestShipmentByOrderId.get(order.id),
        invoiceByOrderId.get(order.id)
      )
    );
}

async function getCustomerOrderDetail(customerId, orderId) {
  const [authStore, invoiceStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readInvoiceStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensureShippingStoreShape(shippingStore);

  const order = findAccessibleOrderOrThrow(authStore, customerId, orderId);
  const shipment = buildLatestShipmentMap(shippingStore).get(order.id) || null;
  const invoice = buildInvoiceByOrderIdMap(invoiceStore).get(order.id) || null;
  const manualPaymentInstructions =
    order.orderStatus === B2B_ORDER_STATUSES.AWAITING_BANK_PAYMENT &&
    [
      PAYMENT_METHODS.DIRECT_BANK_TRANSFER,
      PAYMENT_METHODS.MANUAL_UPI
    ].includes(order.paymentMethod)
      ? getManualPaymentInstructions(order.paymentMethod, paymentStore)
      : null;

  return buildOrderDetail(order, shipment, invoice, {
    manualPaymentInstructions
  });
}

async function listCustomerInvoices(customerId, filters) {
  const [authStore, invoiceStore, shippingStore] = await Promise.all([
    readAuthStore(),
    readInvoiceStore(),
    readShippingStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensureShippingStoreShape(shippingStore);

  const accessibleOrderIds = new Set(
    ensureArray(authStore.orders)
      .filter((order) => isOrderAccessible(order, customerId))
      .map((order) => order.id)
  );
  const orderById = new Map(ensureArray(authStore.orders).map((order) => [order.id, order]));
  const latestShipmentByOrderId = buildLatestShipmentMap(shippingStore);

  return ensureArray(invoiceStore.invoices)
    .filter((invoice) => accessibleOrderIds.has(invoice.orderId))
    .sort((a, b) => Date.parse(b.generatedAt || "") - Date.parse(a.generatedAt || ""))
    .slice(0, Number(filters.limit || 50))
    .map((invoice) =>
      buildInvoiceSummary(
        invoice,
        orderById.get(invoice.orderId),
        latestShipmentByOrderId.get(invoice.orderId)
      )
    );
}

async function getCustomerInvoice(customerId, invoiceId) {
  const [authStore, invoiceStore, shippingStore] = await Promise.all([
    readAuthStore(),
    readInvoiceStore(),
    readShippingStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensureShippingStoreShape(shippingStore);

  const invoice = ensureArray(invoiceStore.invoices).find((row) => row.id === invoiceId);
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }

  const order = findAccessibleOrderOrThrow(authStore, customerId, invoice.orderId);
  const shipment = buildLatestShipmentMap(shippingStore).get(order.id) || null;

  return {
    ...buildInvoiceSummary(invoice, order, shipment),
    downloadAvailable: true
  };
}

async function downloadCustomerInvoice(customerId, invoiceId) {
  const [authStore, invoiceStore] = await Promise.all([readAuthStore(), readInvoiceStore()]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);

  const invoice = ensureArray(invoiceStore.invoices).find((row) => row.id === invoiceId);
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }

  findAccessibleOrderOrThrow(authStore, customerId, invoice.orderId);
  return getInvoiceDownload(invoiceId);
}

async function listCustomerTracking(customerId, filters) {
  const [authStore, invoiceStore, shippingStore] = await Promise.all([
    readAuthStore(),
    readInvoiceStore(),
    readShippingStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensureShippingStoreShape(shippingStore);

  const latestShipmentByOrderId = buildLatestShipmentMap(shippingStore);
  const invoiceByOrderId = buildInvoiceByOrderIdMap(invoiceStore);

  return ensureArray(authStore.orders)
    .filter((order) => isOrderAccessible(order, customerId))
    .filter((order) => latestShipmentByOrderId.has(order.id))
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, Number(filters.limit || 50))
    .map((order) =>
      buildTrackingSummary(
        order,
        latestShipmentByOrderId.get(order.id),
        invoiceByOrderId.get(order.id)
      )
    );
}

async function listCustomerAddresses(customerId) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  return ensureArray(customer.savedAddresses).map(sanitizeCustomerAddress);
}

function applyDefaultAddressFlags(addresses, targetAddressId, nextFlags = {}) {
  for (const address of addresses) {
    if (nextFlags.isDefaultBilling && address.id !== targetAddressId) {
      address.isDefaultBilling = false;
    }
    if (nextFlags.isDefaultShipping && address.id !== targetAddressId) {
      address.isDefaultShipping = false;
    }
  }
}

async function createCustomerAddress(customerId, payload) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  const address = {
    id: generateId("addr"),
    label: payload.label || "",
    name: payload.name,
    mobile: payload.mobile || "",
    email: payload.email || "",
    addressLine1: payload.addressLine1,
    addressLine2: payload.addressLine2 || "",
    city: payload.city,
    state: payload.state,
    stateCode: normalizeStateCode(payload.stateCode),
    pincode: payload.pincode,
    country: payload.country || "India",
    isDefaultBilling: Boolean(payload.isDefaultBilling),
    isDefaultShipping: Boolean(payload.isDefaultShipping)
  };

  applyDefaultAddressFlags(customer.savedAddresses, address.id, address);
  customer.savedAddresses.push(address);
  customer.updatedAt = nowIso();
  await persistAuthStore(authStore);

  return sanitizeCustomerAddress(address);
}

async function updateCustomerAddress(customerId, addressId, patch) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  const address = ensureArray(customer.savedAddresses).find((row) => row.id === addressId);
  if (!address) {
    throw new HttpError(404, "Saved address not found.");
  }

  Object.assign(address, {
    ...(patch.label !== undefined ? { label: patch.label || "" } : {}),
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.mobile !== undefined ? { mobile: patch.mobile || "" } : {}),
    ...(patch.email !== undefined ? { email: patch.email || "" } : {}),
    ...(patch.addressLine1 !== undefined ? { addressLine1: patch.addressLine1 } : {}),
    ...(patch.addressLine2 !== undefined ? { addressLine2: patch.addressLine2 || "" } : {}),
    ...(patch.city !== undefined ? { city: patch.city } : {}),
    ...(patch.state !== undefined ? { state: patch.state } : {}),
    ...(patch.stateCode !== undefined
      ? { stateCode: normalizeStateCode(patch.stateCode) }
      : {}),
    ...(patch.pincode !== undefined ? { pincode: patch.pincode } : {}),
    ...(patch.country !== undefined ? { country: patch.country || "India" } : {}),
    ...(patch.isDefaultBilling !== undefined
      ? { isDefaultBilling: Boolean(patch.isDefaultBilling) }
      : {}),
    ...(patch.isDefaultShipping !== undefined
      ? { isDefaultShipping: Boolean(patch.isDefaultShipping) }
      : {})
  });

  applyDefaultAddressFlags(customer.savedAddresses, address.id, address);
  customer.updatedAt = nowIso();
  await persistAuthStore(authStore);

  return sanitizeCustomerAddress(address);
}

async function deleteCustomerAddress(customerId, addressId) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  const previousLength = ensureArray(customer.savedAddresses).length;
  customer.savedAddresses = ensureArray(customer.savedAddresses).filter(
    (row) => row.id !== addressId
  );
  if (customer.savedAddresses.length === previousLength) {
    throw new HttpError(404, "Saved address not found.");
  }

  customer.updatedAt = nowIso();
  await persistAuthStore(authStore);
  return { deleted: true };
}

async function updateCustomerGstDetails(customerId, payload) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  customer.gstDetails = {
    ...customer.gstDetails,
    ...(payload.gstin !== undefined ? { gstin: payload.gstin || "" } : {}),
    ...(payload.businessName !== undefined
      ? { businessName: payload.businessName || "" }
      : {}),
    ...(payload.contactName !== undefined
      ? { contactName: payload.contactName || "" }
      : {})
  };
  customer.gstin = String(
    payload.gstin !== undefined ? payload.gstin || "" : customer.gstin || customer.gstDetails.gstin || ""
  )
    .trim()
    .toUpperCase();
  customer.updatedAt = nowIso();

  await persistAuthStore(authStore);

  return sanitizeGstDetails(customer.gstDetails);
}

async function listSavedProducts(customerId) {
  const [authStore, catalogStore] = await Promise.all([readAuthStore(), readCatalogStore()]);
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  return buildSavedProducts(customer, catalogStore);
}

async function saveProductForCustomer(customerId, productId) {
  const [authStore, catalogStore] = await Promise.all([readAuthStore(), readCatalogStore()]);
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);
  const product = ensureArray(catalogStore.products).find((row) => row.id === productId);

  if (!product || !product.isActive) {
    throw new HttpError(404, "Product not found.");
  }

  if (!customer.savedProductIds.includes(productId)) {
    customer.savedProductIds.push(productId);
    customer.updatedAt = nowIso();
    await persistAuthStore(authStore);
  }

  return {
    saved: true,
    product: toPublicProductCard(product),
    savedProductIds: [...customer.savedProductIds]
  };
}

async function removeSavedProductForCustomer(customerId, productId) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  customer.savedProductIds = ensureArray(customer.savedProductIds).filter(
    (row) => row !== productId
  );
  customer.updatedAt = nowIso();
  await persistAuthStore(authStore);

  return {
    saved: false,
    savedProductIds: [...customer.savedProductIds]
  };
}

async function linkGuestOrderToCustomer(customerId, payload) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);
  const order = findOrderByIdOrNo(authStore, payload.orderId);

  if (!order) {
    throw new HttpError(404, "Order not found.");
  }

  if (isOrderAccessible(order, customerId)) {
    return {
      linked: false,
      reason: "already_accessible",
      order: {
        id: order.id,
        orderNo: order.orderNo || ""
      }
    };
  }

  if (order.userId && order.userId !== customerId) {
    throw new HttpError(403, "This guest order is already linked to another customer.");
  }

  const canUseEmail = Boolean(customer.verifiedEmail && normalizeEmail(customer.email));
  const canUseMobile = Boolean(customer.verifiedMobile && normalizeMobile(customer.mobile));

  if (!canUseEmail && !canUseMobile) {
    throw new HttpError(
      403,
      "Guest order linking requires a verified email or verified mobile on your account."
    );
  }

  const orderContact = resolveOrderContact(order);
  const matchedByEmail = canUseEmail && orderContact.email === normalizeEmail(customer.email);
  const matchedByMobile =
    canUseMobile && orderContact.mobile === normalizeMobile(customer.mobile);

  if (!matchedByEmail && !matchedByMobile) {
    throw new HttpError(
      403,
      "Verified customer identity does not match the guest order contact details."
    );
  }

  order.userId = customerId;
  order.linkedAt = nowIso();
  order.linkedByField = matchedByEmail ? "verified_email" : "verified_mobile";

  await persistAuthStore(authStore);

  await addActivityLog({
    action: "customer_account.guest_order.linked",
    actorId: customerId,
    actorRole: "customer",
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      linkedByField: order.linkedByField
    }
  });

  return {
    linked: true,
    linkedByField: order.linkedByField,
    order: {
      id: order.id,
      orderNo: order.orderNo || ""
    }
  };
}

async function reorderCustomerOrder(customerId, orderId, payload) {
  const [authStore, catalogStore] = await Promise.all([readAuthStore(), readCatalogStore()]);
  ensureAuthStoreShape(authStore);
  const order = findAccessibleOrderOrThrow(authStore, customerId, orderId);

  let userCart = ensureArray(authStore.userCarts).find((row) => row.userId === customerId);
  if (!userCart) {
    userCart = {
      userId: customerId,
      items: [],
      updatedAt: nowIso()
    };
    authStore.userCarts.push(userCart);
  }

  const baseMap = new Map();
  if (payload.mode === REORDER_MODES.MERGE) {
    for (const item of ensureArray(userCart.items)) {
      baseMap.set(item.productId, Number(item.qty || 0));
    }
  }

  const skippedItems = [];
  const reconciliation = [];
  let addedCount = 0;

  for (const item of ensureArray(order.items)) {
    const product = ensureArray(catalogStore.products).find(
      (row) => row.id === item.productId && row.isActive
    );

    if (!product) {
      skippedItems.push({
        productId: item.productId,
        title: item.title || "",
        reason: "product_unavailable"
      });
      continue;
    }

    const previousQty = Number(baseMap.get(item.productId) || 0);
    const orderedQty = Number(item.qty || 0);
    const nextQty = previousQty + orderedQty;
    const currentMoq = Number(product.moq || 1);
    const availableQty = Math.max(
      0,
      Number(product.stockQty || 0) - Number(product.reservedQty || 0)
    );

    if (nextQty < currentMoq) {
      skippedItems.push({
        productId: item.productId,
        title: item.title || product.title,
        reason: "moq_changed",
        currentMoq
      });
      continue;
    }

    if (!product.allowBackorder && nextQty > availableQty) {
      skippedItems.push({
        productId: item.productId,
        title: item.title || product.title,
        reason: "insufficient_stock",
        availableQty
      });
      continue;
    }

    baseMap.set(item.productId, nextQty);
    reconciliation.push({
      productId: item.productId,
      title: item.title || product.title,
      oldUnitPrice: Number(item.finalUnitPrice || 0),
      currentBasePrice: Number(product.basePrice || 0),
      currentSalePrice: Number(product.salePrice || product.basePrice || 0),
      qty: nextQty
    });
    addedCount += 1;
  }

  if (addedCount === 0 && baseMap.size === 0) {
    throw new HttpError(409, "No order items are currently eligible for reorder.");
  }

  userCart.items = [...baseMap.entries()].map(([productId, qty]) => ({
    productId,
    qty
  }));
  userCart.updatedAt = nowIso();
  await persistAuthStore(authStore);

  const cart = await getCart(
    { customerId, sessionId: null },
    resolveOrderShippingQuery(order)
  );
  const currentByProductId = new Map(
    ensureArray(cart.items).map((item) => [item.productId, item])
  );

  return {
    mode: payload.mode,
    addedCount,
    skippedItems,
    reconciliation: reconciliation.map((item) => {
      const currentCartLine = currentByProductId.get(item.productId);
      return {
        ...item,
        recalculatedUnitPrice: Number(
          currentCartLine?.finalUnitPriceAfterDiscount || item.currentSalePrice || 0
        ),
        priceChanged:
          Number(currentCartLine?.finalUnitPriceAfterDiscount || 0) !==
          Number(item.oldUnitPrice || 0)
      };
    }),
    cart
  };
}

module.exports = {
  getCustomerAccountBootstrap,
  updateCustomerProfile,
  listCustomerOrders,
  getCustomerOrderDetail,
  linkGuestOrderToCustomer,
  reorderCustomerOrder,
  listCustomerInvoices,
  getCustomerInvoice,
  downloadCustomerInvoice,
  listCustomerTracking,
  listCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  updateCustomerGstDetails,
  listSavedProducts,
  saveProductForCustomer,
  removeSavedProductForCustomer
};
