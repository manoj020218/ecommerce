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
const { recalculateOrderItems } = require("../cart-checkout/cart-checkout.service");
const partnersService = require("../partners/partners.service");

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
      // Only present on walk-in orders with a manual per-line discount
      // entered at creation -- 0 on every other order type/older order.
      discountPercent: Number(item.discountPercent || 0),
      discountAmount: Number(item.discountAmount || 0),
      gstRate: Number(item.gstRate || 0),
      taxableValue: Number(item.taxableValue || 0),
      gstAmount: Number(item.gstAmount || 0),
      lineTotal: Number(item.lineTotal || 0),
      // Only present on orders placed after this field was added — older
      // orders show as "" here, handled by falling back to "Normal" in the UI.
      shippingClass: item.shippingClass || ""
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
      await partnersService.creditPartnerCommissionForOrder(order);
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

// Lets admin correct a not-yet-paid order's items/discount — e.g. the buyer
// asked to swap a product before completing payment. Deliberately restricted:
// - manual/offline payment methods only. An online-gateway order (Razorpay/
//   Cashfree) could have a payment mid-flight at the gateway the instant an
//   admin edits it, and the webhook would then confirm the OLD amount against
//   the NEW order total.
// - blocked once an invoice (even a Proforma) already exists — voiding/
//   regenerating an already-issued invoice is a separate concern.
// The actual item/pricing/stock-reservation recalculation lives in
// cart-checkout.service.js, which already owns the checkout-session and
// stock-reservation machinery this has to stay in sync with.
async function editOrderItems(orderId, patch, actor) {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);

  const order = ensureArray(authStore.orders).find((row) => row.id === orderId);
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  if (order.paymentStatus === "paid") {
    throw new HttpError(409, "Cannot edit items on a paid order.");
  }
  if (["cancelled", "fulfilled"].includes(order.orderStatus)) {
    throw new HttpError(409, "Order is in a final state and cannot be edited.");
  }
  if (!MANUAL_PAYMENT_METHODS.has(order.paymentMethod)) {
    throw new HttpError(
      409,
      "Only manual/offline payment orders (bank transfer, manual UPI) can have items edited."
    );
  }
  if (order.invoiceId) {
    throw new HttpError(409, "An invoice already exists for this order — cannot edit items.");
  }

  // recalculateOrderItems logs its own "order.items_edited" activity entry.
  // It re-reads the order itself (rather than reusing the `order` object
  // above) so its read-mutate-write cycle stays on one consistent authStore
  // instance instead of two independently-loaded copies.
  await recalculateOrderItems(orderId, patch.items, patch.discountAmount || 0, actor);

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

const STUCK_PAYMENT_THRESHOLD_MINUTES = 15;
// Routine abandonment (no gateway txn ID) is only useful to surface while
// it's fresh enough that someone might still act on it — past a day it's
// unambiguously dead and just clutters the list forever, since nothing
// ever flips checkoutSession.status away from "payment_attempt_created" on
// its own. Genuinely urgent rows (likelyCharged) are NEVER dropped by age
// -- an old unresolved one is more concerning, not less.
const STALE_ABANDONED_ROW_MAX_AGE_MINUTES = 24 * 60;

// Flags checkout sessions stuck at "payment_attempt_created" past the
// threshold. Most of these are ordinary abandonment (buyer backed out before
// completing payment, already picked up separately by the abandoned-cart
// recovery flow) -- `likelyCharged` (true only when the gateway actually
// returned a txn ID) is what separates that routine case from the genuinely
// urgent one: gateway captured payment but our confirm round-trip/webhook
// never came back, so we have money with no order. See paymentAttempts for
// the gateway order/txn id to cross-check directly in Razorpay/Cashfree's
// dashboard when likelyCharged is true.
async function listStuckPaymentSessions() {
  const authStore = await readAuthStore();
  ensureAuthStoreShape(authStore);
  const sessions = ensureArray(authStore.checkoutSessions);
  const attempts = ensureArray(authStore.paymentAttempts);
  const thresholdMs = STUCK_PAYMENT_THRESHOLD_MINUTES * 60 * 1000;
  const now = Date.now();

  const stuck = sessions.filter((session) => {
    if (session.status !== "payment_attempt_created" || session.paymentMethod !== "online") {
      return false;
    }
    const createdAt = Date.parse(session.createdAt || "");
    return !Number.isNaN(createdAt) && now - createdAt >= thresholdMs;
  });

  const rows = stuck.map((session) => {
    const attempt = attempts.find((row) => row.checkoutSessionId === session.id) || null;
    const contact = session.billingAddress || session.shippingAddress || {};
    const createdAt = Date.parse(session.createdAt || "");

    return {
      checkoutSessionId: session.id,
      createdAt: session.createdAt,
      stuckForMinutes: Number.isNaN(createdAt) ? null : Math.floor((now - createdAt) / 60000),
      customerName: contact.name || contact.companyName || "",
      customerEmail: contact.email || "",
      customerMobile: contact.mobile || "",
      amount: session.cart?.pricing?.grandTotal ?? null,
      gateway: attempt?.gateway || "",
      gatewayOrderId: attempt?.gatewayOrderId || "",
      attemptId: attempt?.id || "",
      // The gateway only ever hands back a txn ID once it has actually
      // processed something on its end (captured payment, or at minimum
      // started a transaction attempt). An attempt stuck at "created" with
      // no txn ID never got that far — almost always the buyer backed out
      // before reaching (or completing) the gateway's own checkout screen,
      // not a captured payment we lost track of. Surfacing this distinction
      // directly instead of leaving every row under one alarming banner —
      // confirmed by cross-checking real "stuck" sessions against Razorpay/
      // Cashfree dashboards (2026-08-15): zero-txn-ID ones were never there.
      gatewayTxnId: attempt?.gatewayTxnId || "",
      likelyCharged: Boolean(attempt?.gatewayTxnId)
    };
  });

  const visibleRows = rows.filter(
    (row) => row.likelyCharged || (row.stuckForMinutes ?? 0) <= STALE_ABANDONED_ROW_MAX_AGE_MINUTES
  );

  visibleRows.sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));
  return visibleRows;
}

module.exports = {
  listOrders,
  getOrderDetail,
  updateOrder,
  editOrderItems,
  exportOrdersCsv,
  listStuckPaymentSessions
};
