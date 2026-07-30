const { HttpError } = require("../../common/http-error");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { readInvoiceStore } = require("../../database/invoice-store");
const { readPaymentStore } = require("../../database/payment-store");
const { readShippingStore } = require("../../database/shipping-store");
const {
  getManualPaymentInstructions
} = require("../payment-gateways/payment-gateways.model");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { notifyCustomerEvent } = require("../marketing/marketing.service");

const MANUAL_PAYMENT_METHODS = new Set(["direct_bank_transfer", "manual_upi"]);

function resolveAcceptanceStatus(order) {
  const status = String(order.orderStatus || "").toLowerCase();
  if (status === "cancelled") return "rejected";

  const method = String(order.paymentMethod || "").toLowerCase();
  const payStatus = String(order.paymentStatus || "").toLowerCase();

  if (MANUAL_PAYMENT_METHODS.has(method)) {
    const manual = String(order.manualPaymentStatus || "").toLowerCase();
    if (manual === "verified") return "accepted";
    return "pending";
  }
  if (method === "cod") return "accepted";
  if (payStatus === "paid") return "accepted";
  if (payStatus === "failed") return "rejected";
  return "pending";
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureAuthStoreShape(store) {
  if (!Array.isArray(store.orders)) {
    store.orders = [];
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
}

function normalizeOrderChannel(order) {
  if (order?.isWalkInOrder) {
    return "walk_in";
  }

  if (order?.isB2BOrderRequest) {
    return "b2b_request";
  }

  return "storefront";
}

function resolveInvoiceStatus(order, invoice) {
  if (invoice || order?.invoiceId) {
    return "generated";
  }

  return "pending";
}

function resolveCustomerSummary(order) {
  const billingAddress = order?.billingAddress || {};
  const shippingAddress = order?.shippingAddress || {};
  const customerName =
    billingAddress.name ||
    shippingAddress.name ||
    order?.companyName ||
    billingAddress.companyName ||
    shippingAddress.companyName ||
    "Guest Customer";

  return {
    customerId: order?.userId || order?.ownerId || "",
    customerName,
    customerEmail: billingAddress.email || shippingAddress.email || "",
    customerMobile: billingAddress.mobile || shippingAddress.mobile || "",
    customerCity: billingAddress.city || shippingAddress.city || "",
    companyName:
      order?.companyName ||
      billingAddress.companyName ||
      shippingAddress.companyName ||
      ""
  };
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

function buildOrderSummary(order, shipment, invoice) {
  const customer = resolveCustomerSummary(order);

  return {
    id: order.id,
    orderNo: order.orderNo || "",
    acceptanceStatus: resolveAcceptanceStatus(order),
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
    shippingMethod: order.shippingMethod || "",
    customerType: order.customerType || "retail",
    priceGroup: order.priceGroup || "",
    channel: normalizeOrderChannel(order),
    orderSource: order.orderSource || "",
    isB2BOrderRequest: Boolean(order.isB2BOrderRequest),
    isWalkInOrder: Boolean(order.isWalkInOrder),
    itemCount: ensureArray(order.items).reduce(
      (sum, item) => sum + Number(item.qty || 0),
      0
    ),
    ...customer
  };
}

function buildOrderDetail(order, shipment, invoice, manualPaymentInstructions) {
  return {
    ...buildOrderSummary(order, shipment, invoice),
    ownerType: order.ownerType || "",
    ownerId: order.ownerId || "",
    checkoutSessionId: order.checkoutSessionId || null,
    orderMode: order.orderMode || "",
    requiresAdminApproval: Boolean(order.requiresAdminApproval),
    isB2BApproved: Boolean(order.isB2BApproved),
    creditAllowed: Boolean(order.creditAllowed),
    bankTransferOnly: Boolean(order.bankTransferOnly),
    pickupAllowed: Boolean(order.pickupAllowed),
    createdByAdminId: order.createdByAdminId || "",
    createdByAdminRole: order.createdByAdminRole || "",
    orderNote: order.orderNote || "",
    gatewayTxnId: order.gatewayTxnId || "",
    billingAddress: order.billingAddress || {},
    shippingAddress: order.shippingAddress || {},
    items: ensureArray(order.items).map((item) => ({
      productId: item.productId,
      title: item.title,
      sku: item.sku || "",
      hsnCode: item.hsnCode || "",
      qty: Number(item.qty || 0),
      unitPriceUsed: Number(item.finalUnitPrice || 0),
      priceSource: item.priceSource || "base",
      selectedPriceMode: item.selectedPriceMode || "",
      bulkApplied: Boolean(item.bulkApplied),
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
    manualPaymentInstructions: manualPaymentInstructions || null,
    adminNote: order.adminNote || "",
    customerNote: order.customerNote || order.orderNote || "",
    tags: Array.isArray(order.tags) ? order.tags : [],
    fulfillmentItems: Array.isArray(order.fulfillmentItems) ? order.fulfillmentItems : []
  };
}

function orderMatchesQuery(order, shipment, invoice, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const customer = resolveCustomerSummary(order);
  const haystack = [
    order.orderNo,
    customer.customerName,
    customer.customerEmail,
    customer.customerMobile,
    customer.companyName,
    order.paymentMethod,
    order.orderStatus,
    order.paymentStatus,
    order.shippingMethod,
    invoice?.invoiceNumber || order.invoiceNumber,
    shipment?.trackingId,
    shipment?.courierName,
    ...ensureArray(order.items).flatMap((item) => [item.title, item.sku]),
    ...ensureArray(order.tags)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function buildOrderListSummary(rows) {
  return {
    totalCount: rows.length,
    storefrontCount: rows.filter((row) => row.channel === "storefront").length,
    walkInCount: rows.filter((row) => row.channel === "walk_in").length,
    b2bRequestCount: rows.filter((row) => row.channel === "b2b_request").length,
    unpaidCount: rows.filter((row) => row.paymentStatus !== "paid").length,
    invoicePendingCount: rows.filter((row) => row.invoiceStatus !== "generated").length
  };
}

async function listOrders(filters) {
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

  let rows = ensureArray(authStore.orders).filter((order) => Boolean(order.id));

  if (filters.channel) {
    rows = rows.filter((order) => normalizeOrderChannel(order) === filters.channel);
  }
  if (filters.status) {
    rows = rows.filter((order) => order.orderStatus === filters.status);
  }
  if (filters.paymentStatus) {
    rows = rows.filter((order) => order.paymentStatus === filters.paymentStatus);
  }
  if (filters.shipmentStatus) {
    rows = rows.filter(
      (order) =>
        (latestShipmentByOrderId.get(order.id)?.shipmentStatus ||
          order.shipmentStatus ||
          "pending_packing") === filters.shipmentStatus
    );
  }
  if (filters.paymentMethod) {
    rows = rows.filter((order) => order.paymentMethod === filters.paymentMethod);
  }
  if (filters.customerType) {
    rows = rows.filter(
      (order) => (order.customerType || "retail") === filters.customerType
    );
  }
  if (filters.invoiceStatus) {
    rows = rows.filter(
      (order) =>
        resolveInvoiceStatus(order, invoiceByOrderId.get(order.id)) === filters.invoiceStatus
    );
  }
  if (filters.q) {
    rows = rows.filter((order) =>
      orderMatchesQuery(
        order,
        latestShipmentByOrderId.get(order.id),
        invoiceByOrderId.get(order.id),
        filters.q
      )
    );
  }

  rows = rows.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  const summarizedRows = rows.map((order) =>
    buildOrderSummary(
      order,
      latestShipmentByOrderId.get(order.id),
      invoiceByOrderId.get(order.id)
    )
  );

  return {
    summary: buildOrderListSummary(summarizedRows),
    rows: summarizedRows.slice(0, Number(filters.limit || 50))
  };
}

async function getOrderDetail(orderId) {
  const [authStore, invoiceStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readInvoiceStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensureAuthStoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensureShippingStoreShape(shippingStore);

  const order = ensureArray(authStore.orders).find((row) => row.id === orderId);
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }

  const shipment = buildLatestShipmentMap(shippingStore).get(order.id) || null;
  const invoice = buildInvoiceByOrderIdMap(invoiceStore).get(order.id) || null;
  const manualPaymentInstructions =
    MANUAL_PAYMENT_METHODS.has(order.paymentMethod) && order.paymentStatus !== "paid"
      ? getManualPaymentInstructions(order.paymentMethod, paymentStore)
      : null;

  return buildOrderDetail(order, shipment, invoice, manualPaymentInstructions);
}

async function updateOrder(orderId, patch, actor) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);

  const idx = ensureArray(authStore.orders).findIndex((o) => o.id === orderId);
  if (idx === -1) throw new HttpError(404, "Order not found.");

  const order = authStore.orders[idx];

  const enteringProcessing = patch.orderStatus === "processing" && order.orderStatus !== "processing";

  if (patch.orderStatus !== undefined) {
    const allowed = ["processing", "cancelled", "fulfilled"];
    if (!allowed.includes(patch.orderStatus)) {
      throw new HttpError(400, `Invalid order status. Allowed: ${allowed.join(", ")}.`);
    }
    order.orderStatus = patch.orderStatus;
    if (patch.orderStatus === "cancelled") order.shipmentStatus = "cancelled";
  }
  if (patch.manualPaymentStatus !== undefined) {
    order.manualPaymentStatus = patch.manualPaymentStatus;
    if (patch.manualPaymentStatus === "verified") {
      order.paymentStatus = "paid";
      order.paymentVerifiedAt = new Date().toISOString();
      if (actor) order.paymentVerifiedByAdminId = actor.id;
    }
  }
  if (patch.adminNote !== undefined) order.adminNote = String(patch.adminNote || "").trim();
  if (patch.customerNote !== undefined) order.customerNote = String(patch.customerNote || "").trim();
  if (patch.tags !== undefined) {
    order.tags = ensureArray(patch.tags)
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (patch.fulfillmentItems !== undefined) {
    order.fulfillmentItems = ensureArray(patch.fulfillmentItems).map((item, i) => ({
      srNo: Number(item.srNo || i + 1),
      productId: String(item.productId || ""),
      title: String(item.title || "").trim(),
      fulfillQty: Number(item.fulfillQty || 0)
    }));
  }
  order.updatedAt = new Date().toISOString();
  authStore.orders[idx] = order;
  await writeAuthStore(authStore);

  await addActivityLog({
    action: "order.updated",
    actorId: actor?.id,
    actorRole: actor?.role,
    resourceType: "order",
    resourceId: orderId,
    metadata: { patch: Object.keys(patch) }
  });

  if (enteringProcessing) {
    const contact = order.billingAddress || order.shippingAddress || {};
    await notifyCustomerEvent({
      eventKey: "order_processing",
      toEmail: String(contact.email || "").trim().toLowerCase(),
      toMobile: String(contact.mobile || "").trim(),
      relatedResourceType: "order",
      relatedResourceId: order.id,
      variables: {
        customerName: contact.companyName || contact.name || order.customerName || "Customer",
        orderNo: order.orderNo || ""
      }
    });
  }

  return getOrderDetail(orderId);
}

function escapeCSV(value) {
  const str = String(value ?? "").replace(/"/g, '""');
  return /[",\n\r]/.test(str) ? `"${str}"` : str;
}

async function exportOrdersCsv(filters) {
  const { rows } = await listOrders({ ...filters, limit: 2000 });
  const headers = [
    "OrderNo", "OrderDate", "CustomerName", "CustomerEmail", "CustomerMobile",
    "Channel", "AcceptanceStatus", "OrderStatus", "PaymentMethod", "PaymentStatus",
    "ShipmentStatus", "InvoiceStatus", "Total"
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      escapeCSV(row.orderNo), escapeCSV(row.orderDate),
      escapeCSV(row.customerName), escapeCSV(row.customerEmail),
      escapeCSV(row.customerMobile), escapeCSV(row.channel),
      escapeCSV(row.acceptanceStatus), escapeCSV(row.orderStatus),
      escapeCSV(row.paymentMethod), escapeCSV(row.paymentStatus),
      escapeCSV(row.shipmentStatus), escapeCSV(row.invoiceStatus),
      escapeCSV(row.orderTotal)
    ].join(","));
  }
  return lines.join("\r\n");
}

module.exports = {
  listOrders,
  getOrderDetail,
  updateOrder,
  exportOrdersCsv
};
