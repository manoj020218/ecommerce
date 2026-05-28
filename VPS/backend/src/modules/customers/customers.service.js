const { HttpError } = require("../../common/http-error");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  PAYMENT_METHODS
} = require("../cart-checkout/cart-checkout.model");
const {
  ensureCustomerAccountShape
} = require("../customer-account/customer-account.model");
const {
  CUSTOMER_TYPES,
  ORDER_MODES,
  B2B_ORDER_STATUSES,
  normalizeCustomerType,
  normalizePriceGroup,
  normalizeOrderMode,
  buildCustomerPricingContext,
  isApprovedB2BCustomer
} = require("./customers.model");
const {
  safeSendTemplateNotification
} = require("../marketing/marketing.service");

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function ensureCustomersStoreShape(store) {
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

function findCustomerOrThrow(authStore, customerId) {
  const customer = ensureArray(authStore.users).find((row) => row.id === customerId);
  if (!customer) {
    throw new HttpError(404, "Customer not found.");
  }
  ensureCustomerAccountShape(customer);
  return customer;
}

function findOrderOrThrow(authStore, orderId) {
  const order = ensureArray(authStore.orders).find(
    (row) => row.id === orderId || row.orderNo === orderId
  );
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  return order;
}

function buildCustomerStats(authStore, customerId) {
  const orders = ensureArray(authStore.orders)
    .filter((order) => order.userId === customerId)
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""));

  return {
    orderCount: orders.length,
    lastOrderAt: orders[0]?.createdAt || null
  };
}

function sanitizeAdminCustomer(customer, authStore) {
  const b2b = buildCustomerPricingContext(customer) || {};
  const stats = buildCustomerStats(authStore, customer.id);

  return {
    id: customer.id,
    name: customer.name || "",
    email: customer.email || "",
    mobile: customer.mobile || "",
    companyName: customer.companyName || "",
    customerType: b2b.customerType || "retail",
    priceGroup: b2b.priceGroup || "",
    isB2BApproved: Boolean(b2b.isB2BApproved),
    gstin: b2b.gstin || "",
    creditAllowed: Boolean(b2b.creditAllowed),
    bankTransferOnly: Boolean(b2b.bankTransferOnly),
    pickupAllowed: Boolean(b2b.pickupAllowed),
    orderMode: b2b.orderMode || ORDER_MODES.ONLINE,
    verifiedEmail: Boolean(customer.verifiedEmail),
    verifiedMobile: Boolean(customer.verifiedMobile),
    createdAt: customer.createdAt || null,
    lastLoginAt: customer.lastLoginAt || null,
    ...stats
  };
}

function sanitizeB2BOrder(order, customer) {
  return {
    id: order.id,
    orderNo: order.orderNo || "",
    customerId: order.userId || "",
    customerName:
      customer?.name ||
      order.billingAddress?.name ||
      order.shippingAddress?.name ||
      "Customer",
    companyName:
      order.companyName ||
      customer?.companyName ||
      order.billingAddress?.companyName ||
      order.shippingAddress?.companyName ||
      "",
    customerType: order.customerType || "retail",
    priceGroup: order.priceGroup || "",
    paymentStatus: order.paymentStatus || "",
    orderStatus: order.orderStatus || "",
    manualPaymentStatus: order.manualPaymentStatus || "",
    paymentMethod: order.paymentMethod || "",
    shippingMethod: order.shippingMethod || "",
    shipmentStatus: order.shipmentStatus || "pending_packing",
    grandTotal: Number(order.grandTotal || 0),
    itemCount: ensureArray(order.items).reduce(
      (sum, item) => sum + Number(item.qty || 0),
      0
    ),
    isB2BOrderRequest: Boolean(order.isB2BOrderRequest),
    createdAt: order.createdAt || null,
    orderRequestReceivedAt: order.orderRequestReceivedAt || null,
    approvedAt: order.approvedAt || null,
    approvedBy: order.approvedBy || null,
    paymentVerifiedAt: order.paymentVerifiedAt || null,
    fulfilmentUpdatedAt: order.fulfilmentUpdatedAt || null
  };
}

async function listCustomers(filters) {
  const authStore = await readAuthStore();
  ensureCustomersStoreShape(authStore);

  let rows = [...authStore.users];

  if (filters.customerType) {
    rows = rows.filter(
      (user) => normalizeCustomerType(user.customerType) === filters.customerType
    );
  }

  if (filters.approvalStatus === "approved") {
    rows = rows.filter((user) => isApprovedB2BCustomer(user));
  } else if (filters.approvalStatus === "not_approved") {
    rows = rows.filter((user) => !Boolean(user.isB2BApproved));
  }

  if (filters.q) {
    const query = normalizeText(filters.q);
    rows = rows.filter((user) =>
      [
        user.name,
        user.email,
        user.mobile,
        user.companyName,
        user.gstin,
        user.id
      ]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(query))
    );
  }

  return rows
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, Number(filters.limit || 100))
    .map((customer) => sanitizeAdminCustomer(customer, authStore));
}

async function updateCustomer(customerId, patch, actor) {
  const authStore = await readAuthStore();
  ensureCustomersStoreShape(authStore);
  const customer = findCustomerOrThrow(authStore, customerId);

  if (patch.customerType !== undefined) {
    customer.customerType = normalizeCustomerType(patch.customerType);
  }
  if (patch.isB2BApproved === true && normalizeCustomerType(customer.customerType) === "retail") {
    customer.customerType = "dealer";
  }
  if (patch.priceGroup !== undefined) {
    customer.priceGroup = normalizePriceGroup(
      patch.priceGroup || customer.customerType || ""
    );
  }
  if (patch.isB2BApproved !== undefined) {
    customer.isB2BApproved = Boolean(patch.isB2BApproved);
  }
  if (patch.gstin !== undefined) {
    customer.gstin = String(patch.gstin || "").trim().toUpperCase();
    customer.gstDetails = {
      ...customer.gstDetails,
      gstin: customer.gstin
    };
  }
  if (patch.companyName !== undefined) {
    customer.companyName = patch.companyName || "";
  }
  if (patch.creditAllowed !== undefined) {
    customer.creditAllowed = Boolean(patch.creditAllowed);
  }
  if (patch.bankTransferOnly !== undefined) {
    customer.bankTransferOnly = Boolean(patch.bankTransferOnly);
  }
  if (patch.pickupAllowed !== undefined) {
    customer.pickupAllowed = Boolean(patch.pickupAllowed);
  }
  if (patch.orderMode !== undefined) {
    customer.orderMode = normalizeOrderMode(
      patch.orderMode,
      customer.isB2BApproved ? ORDER_MODES.OFFLINE_REQUEST : ORDER_MODES.ONLINE
    );
  }

  ensureCustomerAccountShape(customer);
  customer.updatedAt = nowIso();

  await writeAuthStore(authStore);

  await addActivityLog({
    action: "customers.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "customer",
    resourceId: customer.id,
    metadata: {
      changedFields: Object.keys(patch || {})
    }
  });

  return sanitizeAdminCustomer(customer, authStore);
}

async function listOrderRequests(filters) {
  const authStore = await readAuthStore();
  ensureCustomersStoreShape(authStore);
  const customerById = new Map(authStore.users.map((customer) => [customer.id, customer]));

  let rows = ensureArray(authStore.orders).filter((order) => Boolean(order.isB2BOrderRequest));

  if (filters.customerId) {
    rows = rows.filter((order) => order.userId === filters.customerId);
  }

  if (filters.status) {
    const normalizedStatus = normalizeText(filters.status);
    rows = rows.filter(
      (order) => normalizeText(order.orderStatus) === normalizedStatus
    );
  }

  return rows
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, Number(filters.limit || 100))
    .map((order) => sanitizeB2BOrder(order, customerById.get(order.userId)));
}

async function approveOrderRequest(orderId, payload, actor) {
  const authStore = await readAuthStore();
  ensureCustomersStoreShape(authStore);
  const order = findOrderOrThrow(authStore, orderId);

  if (!order.isB2BOrderRequest) {
    throw new HttpError(409, "This order is not a B2B order request.");
  }

  if (order.orderStatus !== B2B_ORDER_STATUSES.AWAITING_ADMIN_APPROVAL) {
    throw new HttpError(409, "Order request is not awaiting admin approval.");
  }

  if (
    payload.paymentMethod === PAYMENT_METHODS.MANUAL_UPI &&
    order.bankTransferOnly
  ) {
    throw new HttpError(409, "This customer account accepts bank transfer only.");
  }

  order.orderStatus = B2B_ORDER_STATUSES.AWAITING_BANK_PAYMENT;
  order.paymentMethod = payload.paymentMethod;
  order.manualPaymentStatus = "awaiting_submission";
  order.approvedAt = nowIso();
  order.approvedBy = actor.id;
  order.updatedAt = order.approvedAt;
  order.approvalNote = payload.approvalNote || "";

  await writeAuthStore(authStore);

  await addActivityLog({
    action: "customers.order_request.approved",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "order",
    resourceId: order.id
  });

  await safeSendTemplateNotification({
    templateKey: "dealer_order_approved",
    toEmail:
      order.shippingAddress?.email ||
      order.billingAddress?.email ||
      "",
    relatedResourceType: "order",
    relatedResourceId: order.id,
    variables: {
      customerName:
        order.billingAddress?.companyName ||
        order.billingAddress?.name ||
        order.shippingAddress?.companyName ||
        order.shippingAddress?.name ||
        "Customer",
      orderNo: order.orderNo || ""
    }
  });

  return sanitizeB2BOrder(order, authStore.users.find((user) => user.id === order.userId));
}

function mapOrderStatusToShipmentStatus(orderStatus, currentShipmentStatus) {
  switch (orderStatus) {
    case B2B_ORDER_STATUSES.PACKING_STARTED:
      return "pending_packing";
    case B2B_ORDER_STATUSES.READY_FOR_PICKUP:
      return "ready_for_pickup";
    case B2B_ORDER_STATUSES.DISPATCHED:
      return "shipped";
    case B2B_ORDER_STATUSES.DELIVERED:
      return "delivered";
    case B2B_ORDER_STATUSES.PICKED_UP:
      return "picked_up";
    case B2B_ORDER_STATUSES.CANCELLED:
      return "cancelled";
    case B2B_ORDER_STATUSES.COMPLETED:
      return currentShipmentStatus || "delivered";
    default:
      return currentShipmentStatus || "pending_packing";
  }
}

async function updateB2BOrderStatus(orderId, payload, actor) {
  const authStore = await readAuthStore();
  ensureCustomersStoreShape(authStore);
  const order = findOrderOrThrow(authStore, orderId);

  if (!order.isB2BOrderRequest) {
    throw new HttpError(409, "Only B2B order requests can be updated here.");
  }

  if (
    payload.orderStatus !== B2B_ORDER_STATUSES.CANCELLED &&
    normalizeText(order.paymentStatus) !== "paid"
  ) {
    throw new HttpError(409, "Only paid B2B orders can move into fulfilment statuses.");
  }

  order.orderStatus = payload.orderStatus;
  order.shipmentStatus = mapOrderStatusToShipmentStatus(
    payload.orderStatus,
    order.shipmentStatus
  );
  order.fulfilmentUpdatedAt = nowIso();
  order.updatedAt = order.fulfilmentUpdatedAt;
  order.adminStatusNote = payload.adminNote || "";

  await writeAuthStore(authStore);

  await addActivityLog({
    action: "customers.order_request.status_updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderStatus: payload.orderStatus
    }
  });

  if (payload.orderStatus === B2B_ORDER_STATUSES.READY_FOR_PICKUP) {
    await safeSendTemplateNotification({
      templateKey: "ready_for_pickup",
      toEmail: order.shippingAddress?.email || order.billingAddress?.email || "",
      relatedResourceType: "order",
      relatedResourceId: order.id,
      variables: {
        customerName:
          order.billingAddress?.companyName ||
          order.billingAddress?.name ||
          order.shippingAddress?.companyName ||
          order.shippingAddress?.name ||
          "Customer",
        orderNo: order.orderNo || "",
        pickupLocation: order.shippingAddress?.addressLine1 || "",
        pickupInstructions: payload.adminNote || ""
      }
    });
  }

  if (payload.orderStatus === B2B_ORDER_STATUSES.PICKED_UP) {
    await safeSendTemplateNotification({
      templateKey: "self_pickup_completed",
      toEmail: order.shippingAddress?.email || order.billingAddress?.email || "",
      relatedResourceType: "order",
      relatedResourceId: order.id,
      variables: {
        customerName:
          order.billingAddress?.companyName ||
          order.billingAddress?.name ||
          order.shippingAddress?.companyName ||
          order.shippingAddress?.name ||
          "Customer",
        orderNo: order.orderNo || ""
      }
    });
  }

  return sanitizeB2BOrder(order, authStore.users.find((user) => user.id === order.userId));
}

module.exports = {
  listCustomers,
  updateCustomer,
  listOrderRequests,
  approveOrderRequest,
  updateB2BOrderStatus
};
