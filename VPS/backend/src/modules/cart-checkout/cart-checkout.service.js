const crypto = require("node:crypto");
const { HttpError } = require("../../common/http-error");
const { env } = require("../../config/env");
const { generateId, hashValue } = require("../../common/identity");
const { readAuthStore, writeAuthStore } = require("../../database/auth-store");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { readInvoiceStore } = require("../../database/invoice-store");
const { readPaymentStore, writePaymentStore } = require("../../database/payment-store");
const { readShippingStore } = require("../../database/shipping-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const {
  ensureCustomerAccountShape
} = require("../customer-account/customer-account.model");
const {
  buildCustomerPricingContext,
  B2B_ORDER_STATUSES,
  ORDER_MODES
} = require("../customers/customers.model");
const {
  calculateAvailableQty,
  resolveProductUnitPrice
} = require("../products/products.model");
const {
  createPaymentGateway
} = require("../../integrations/payment-gateways/payment-gateway.adapter");
const {
  createShippingProvider
} = require("../../integrations/shipping-providers/shipping-provider.adapter");
const {
  resolveDirectPaymentDiscountPercent,
  getManualPaymentInstructions
} = require("../payment-gateways/payment-gateways.model");
const {
  ensurePaymentStoreShape,
  resolveGatewayForPaymentAttempt
} = require("../payment-gateways/payment-gateways.service");
const {
  ensureInvoiceForOrder,
  getInvoiceDownload
} = require("../invoices/invoices.service");
const {
  trackCartSaved,
  trackCheckoutStarted,
  trackPaymentAttemptCreated,
  trackPaymentFailed,
  trackRecoveryCompleted
} = require("../abandoned-cart/abandoned-cart.service");
const {
  safeSendTemplateNotification
} = require("../marketing/marketing.service");
const {
  CART_OWNER_TYPES,
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  CHECKOUT_STATUSES,
  RESERVATION_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  SHARE_CLAIM_MODES,
  QUOTE_REQUEST_STATUSES,
  sanitizeCartView,
  sanitizeCheckoutSession,
  sanitizeReservation
} = require("./cart-checkout.model");

const STOCK_RESERVATION_MINUTES = Number(env.cartStockReservationMinutes || 15);

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function getReservationTtlMinutes() {
  if (Number.isNaN(STOCK_RESERVATION_MINUTES) || STOCK_RESERVATION_MINUTES < 5) {
    return 15;
  }
  return STOCK_RESERVATION_MINUTES;
}

function ensurePhase7StoreShape(store) {
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
  if (!Array.isArray(store.guestCarts)) {
    store.guestCarts = [];
  }
  if (!Array.isArray(store.userCarts)) {
    store.userCarts = [];
  }
  if (!Array.isArray(store.cartShares)) {
    store.cartShares = [];
  }
  if (!Array.isArray(store.stockReservations)) {
    store.stockReservations = [];
  }
  if (!Array.isArray(store.checkoutSessions)) {
    store.checkoutSessions = [];
  }
  if (!Array.isArray(store.paymentAttempts)) {
    store.paymentAttempts = [];
  }
  if (!Array.isArray(store.quoteRequests)) {
    store.quoteRequests = [];
  }
  if (!Array.isArray(store.orders)) {
    store.orders = [];
  }

  for (const user of store.users) {
    ensureCustomerAccountShape(user);
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

function resolveStockStatus(product) {
  const availableQty = calculateAvailableQty(product);
  const lowStockThreshold = Number(product.lowStockThreshold || 0);

  if (availableQty <= 0) {
    return product.allowBackorder ? "backorder" : "out_of_stock";
  }

  if (availableQty <= lowStockThreshold) {
    return "low_stock";
  }

  return "in_stock";
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

function shouldExposeManualPaymentInstructions(order) {
  if (!order) {
    return false;
  }

  if (
    ![PAYMENT_METHODS.DIRECT_BANK_TRANSFER, PAYMENT_METHODS.MANUAL_UPI].includes(
      order.paymentMethod
    )
  ) {
    return false;
  }

  if (String(order.paymentStatus || "").trim().toLowerCase() === "paid") {
    return false;
  }

  if (order.isB2BOrderRequest) {
    return order.orderStatus === B2B_ORDER_STATUSES.AWAITING_BANK_PAYMENT;
  }

  return true;
}

function buildCheckoutOrderFollowup(order, shipment, invoice, manualPaymentInstructions) {
  return {
    id: order.id,
    orderNo: order.orderNo || "",
    orderDate: order.createdAt || null,
    orderTotal: Number(order.grandTotal || 0),
    paymentStatus: order.paymentStatus || "",
    orderStatus: order.orderStatus || "",
    shipmentStatus: shipment?.shipmentStatus || order.shipmentStatus || "pending_packing",
    manualPaymentStatus: order.manualPaymentStatus || "",
    paymentMethod: order.paymentMethod || "",
    shippingMethod: order.shippingMethod || "",
    customerType: order.customerType || "retail",
    priceGroup: order.priceGroup || "",
    isB2BOrderRequest: Boolean(order.isB2BOrderRequest),
    billingAddress: order.billingAddress || {},
    shippingAddress: order.shippingAddress || {},
    items: ensureArray(order.items).map((item) => ({
      productId: item.productId,
      title: item.title,
      sku: item.sku || "",
      hsnCode: item.hsnCode || "",
      qty: Number(item.qty || 0),
      unitPriceUsed: Number(item.finalUnitPrice || 0),
      gstRate: Number(item.gstRate || 0),
      taxableValue: Number(item.taxableValue || 0),
      gstAmount: Number(item.gstAmount || 0),
      lineTotal: Number(item.lineTotal || 0),
      availabilityStatus: item.availabilityStatus || "confirmed"
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
    manualPaymentInstructions: manualPaymentInstructions || null
  };
}

function resolveCartOwner(context) {
  if (context.customerId) {
    return {
      ownerType: CART_OWNER_TYPES.CUSTOMER,
      ownerId: context.customerId
    };
  }

  if (context.sessionId) {
    return {
      ownerType: CART_OWNER_TYPES.GUEST,
      ownerId: context.sessionId
    };
  }

  throw new HttpError(
    400,
    "Guest sessionId is required when customer authentication is not present."
  );
}

function getCartCollectionByOwnerType(store, ownerType) {
  return ownerType === CART_OWNER_TYPES.CUSTOMER ? store.userCarts : store.guestCarts;
}

function ensureCartRecord(store, owner, createIfMissing = true) {
  const collection = getCartCollectionByOwnerType(store, owner.ownerType);
  const keyName = owner.ownerType === CART_OWNER_TYPES.CUSTOMER ? "userId" : "sessionId";

  let cart = collection.find((row) => row[keyName] === owner.ownerId);

  if (!cart && createIfMissing) {
    cart = {
      [keyName]: owner.ownerId,
      items: [],
      updatedAt: nowIso()
    };
    collection.push(cart);
  }

  if (cart && !Array.isArray(cart.items)) {
    cart.items = [];
  }

  return cart || null;
}

function findActiveProductOrThrow(catalogStore, productId) {
  const row = catalogStore.products.find((product) => product.id === productId);
  if (!row || !row.isActive) {
    throw new HttpError(409, "One or more cart items are unavailable.");
  }
  return row;
}

function computeEffectiveAvailableQty(product, reservedForCurrentCheckout = 0) {
  const stockQty = Number(product.stockQty || 0);
  const reservedQty = Number(product.reservedQty || 0);
  return Math.max(0, stockQty - reservedQty + Number(reservedForCurrentCheckout || 0));
}

function resolveCustomerPricingContextForOwner(authStore, owner) {
  if (!owner || owner.ownerType !== CART_OWNER_TYPES.CUSTOMER) {
    return null;
  }

  const customer = ensureArray(authStore.users).find((row) => row.id === owner.ownerId);
  if (!customer) {
    return null;
  }

  ensureCustomerAccountShape(customer);
  return buildCustomerPricingContext(customer);
}

function enrichOrderAddressSnapshot(address = {}, customerPricingContext = null) {
  return {
    ...address,
    companyName:
      address.companyName ||
      customerPricingContext?.companyName ||
      "",
    gstin:
      String(
        address.gstin ||
          address.gstNumber ||
          customerPricingContext?.gstin ||
          ""
      )
        .trim()
        .toUpperCase()
  };
}

function buildCartLineFromItem(catalogStore, item, options = {}) {
  const product = findActiveProductOrThrow(catalogStore, item.productId);
  const qty = Number(item.qty || 0);

  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpError(400, "Cart quantity must be a positive integer.");
  }

  const moq = Number(product.moq || 1);
  if (qty < moq) {
    throw new HttpError(400, `MOQ not met for product '${product.title}'.`);
  }

  const availableQty = computeEffectiveAvailableQty(
    product,
    Number(options.reservedForCurrentCheckout || 0)
  );
  if (
    options.enforceStockCheck &&
    !product.allowBackorder &&
    Number(product.stockQty || 0) > 0 &&
    qty > availableQty
  ) {
    throw new HttpError(409, "Requested quantity is not available right now.");
  }

  const pricing = resolveProductUnitPrice(product, {
    qty,
    customerPricingContext: options.customerPricingContext || null
  });
  const unitPrice = Number(pricing.unitPrice || 0);
  const lineSubtotal = roundMoney(unitPrice * qty);
  const quoteRequiredAboveQty =
    product.quoteRequiredAboveQty === null || product.quoteRequiredAboveQty === undefined
      ? null
      : Number(product.quoteRequiredAboveQty);

  const firstImage = Array.isArray(product.images) && product.images[0];
  const imageUrl = firstImage
    ? (typeof firstImage === "string" ? firstImage : firstImage.thumbnail || firstImage.url || "")
    : "";

  return {
    productId: product.id,
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    imageUrl,
    hsnCode: product.hsnCode || "",
    qty,
    moq,
    gstRate: Number(product.gstRate || 0),
    priceIncludesGst: Boolean(product.priceIncludesGst),
    unitPrice: Number(unitPrice),
    finalUnitPriceAfterDiscount: Number(unitPrice),
    priceSource: pricing.priceSource || "base",
    compareAtUnitPrice:
      pricing.retailDisplayPrice > unitPrice ? Number(pricing.retailDisplayPrice) : null,
    discountAmount: 0,
    taxableValue: lineSubtotal,
    gstAmount: 0,
    lineTotal: 0,
    lineSubtotal,
    bulkApplied: Boolean(pricing.bulkApplied),
    bulkRule: pricing.bulkRule || null,
    quoteRequired:
      quoteRequiredAboveQty !== null && qty >= Number(quoteRequiredAboveQty || 0),
    quoteRequiredAboveQty,
    availabilityStatus: product.stockStatus || "in_stock",
    stockVisibility: "hide_quantity",
    allowBackorder: Boolean(product.allowBackorder),
    deadWeightKg: Number(product.deadWeightKg || 0),
    lengthCm:
      product.lengthCm === null || product.lengthCm === undefined
        ? null
        : Number(product.lengthCm),
    widthCm:
      product.widthCm === null || product.widthCm === undefined
        ? null
        : Number(product.widthCm),
    heightCm:
      product.heightCm === null || product.heightCm === undefined
        ? null
        : Number(product.heightCm),
    shippingClass: product.shippingClass || "normal",
    shippingIncluded: Boolean(product.shippingIncluded)
  };
}

function normalizeDestination(destination) {
  return {
    pincode: String(destination?.pincode || destination?.shippingPincode || "")
      .trim()
      .replace(/[^0-9]/g, "")
      .slice(0, 6),
    stateCode: String(
      destination?.stateCode || destination?.shippingStateCode || ""
    )
      .trim()
      .toUpperCase(),
    state: String(destination?.state || destination?.shippingState || "")
      .trim()
      .toUpperCase()
  };
}

async function calculateShippingQuote(lines, shippingMethod, destination, shippingStore) {
  const provider = createShippingProvider("manual_courier");
  return provider.calculateShipping({
    lines,
    shippingMethod,
    destination: normalizeDestination(destination || {}),
    shippingStore
  });
}

async function calculatePricing(
  lines,
  paymentMethod,
  shippingMethod,
  destination,
  shippingStore,
  paymentStore
) {
  const itemCount = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
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
    const lineAfterDiscount = roundMoney(line.lineSubtotal - lineDiscount);
    if (line.priceIncludesGst && line.gstRate > 0) {
      // Price already contains GST — extract the tax component
      const divisor = 1 + Number(line.gstRate) / 100;
      line.taxableValue = roundMoney(lineAfterDiscount / divisor);
      line.gstAmount = roundMoney(lineAfterDiscount - line.taxableValue);
      line.lineTotal = lineAfterDiscount;
    } else {
      line.taxableValue = lineAfterDiscount;
      line.gstAmount = roundMoney(line.taxableValue * (Number(line.gstRate || 0) / 100));
      line.lineTotal = roundMoney(line.taxableValue + line.gstAmount);
    }
    line.finalUnitPriceAfterDiscount = roundMoney(line.lineTotal / line.qty);

    taxableValue = roundMoney(taxableValue + line.taxableValue);
    gstTotal = roundMoney(gstTotal + line.gstAmount);
  }

  const shippingQuote = await calculateShippingQuote(
    lines,
    shippingMethod,
    destination,
    shippingStore
  );
  const shippingCharge = Number(shippingQuote.shippingCharge || 0);
  const preRoundGrand = roundMoney(taxableValue + gstTotal + shippingCharge);
  const roundedGrand = Math.round(preRoundGrand);
  const roundOff = roundMoney(roundedGrand - preRoundGrand);
  const grandTotal = roundMoney(preRoundGrand + roundOff);

  return {
    itemCount,
    productSubtotal,
    discountAmount,
    taxableValue,
    gstTotal,
    shippingCharge,
    roundOff,
    grandTotal,
    paymentMethod,
    shippingMethod,
    shippingMeta: {
      zone: shippingQuote.zone,
      zoneLabel: shippingQuote.zoneLabel,
      totalWeightKg: shippingQuote.totalWeightKg,
      remoteExtraCharge: shippingQuote.remoteExtraCharge
    }
  };
}

function mapReservationItemsByProduct(reservation) {
  const map = new Map();
  if (!reservation || !Array.isArray(reservation.items)) {
    return map;
  }
  for (const item of reservation.items) {
    map.set(item.productId, Number(item.qty || 0));
  }
  return map;
}

function buildStrictCartLines(catalogStore, cartItems, options = {}) {
  const safeItems = ensureArray(cartItems);
  const lines = [];

  for (const item of safeItems) {
    const reservedForCurrentCheckout = options.reservedByProduct?.get(item.productId) || 0;
    lines.push(
      buildCartLineFromItem(catalogStore, item, {
        enforceStockCheck: Boolean(options.enforceStockCheck),
        reservedForCurrentCheckout,
        customerPricingContext: options.customerPricingContext || null
      })
    );
  }

  return lines;
}

function buildCartView(owner, cart, lines, pricing) {
  return sanitizeCartView({
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    updatedAt: cart?.updatedAt || null,
    itemCount: pricing.itemCount,
    items: lines,
    pricing
  });
}

function releaseReservationInternal(catalogStore, reservation, reason, nextStatus) {
  if (!reservation || reservation.status !== RESERVATION_STATUSES.ACTIVE) {
    return false;
  }

  for (const item of ensureArray(reservation.items)) {
    const index = catalogStore.products.findIndex((row) => row.id === item.productId);
    if (index < 0) {
      continue;
    }

    const product = catalogStore.products[index];
    const nextReserved = Math.max(
      0,
      Number(product.reservedQty || 0) - Number(item.qty || 0)
    );

    catalogStore.products[index] = {
      ...product,
      reservedQty: nextReserved,
      stockStatus: resolveStockStatus({
        ...product,
        reservedQty: nextReserved
      }),
      updatedAt: nowIso()
    };
  }

  reservation.status = nextStatus || RESERVATION_STATUSES.RELEASED;
  reservation.releaseReason = reason;
  reservation.releasedAt = nowIso();
  return true;
}

function expireReservationInternal(catalogStore, reservation) {
  if (!reservation || reservation.status !== RESERVATION_STATUSES.ACTIVE) {
    return false;
  }

  const changed = releaseReservationInternal(
    catalogStore,
    reservation,
    "timeout",
    RESERVATION_STATUSES.EXPIRED
  );
  if (changed) {
    reservation.expiredAt = nowIso();
  }
  return changed;
}

function consumeReservationInternal(catalogStore, reservation) {
  if (!reservation || reservation.status !== RESERVATION_STATUSES.ACTIVE) {
    return false;
  }

  for (const item of ensureArray(reservation.items)) {
    const index = catalogStore.products.findIndex((row) => row.id === item.productId);
    if (index < 0) {
      continue;
    }

    const product = catalogStore.products[index];
    const nextStockQty = Math.max(0, Number(product.stockQty || 0) - Number(item.qty || 0));
    const nextReserved = Math.max(
      0,
      Number(product.reservedQty || 0) - Number(item.qty || 0)
    );

    catalogStore.products[index] = {
      ...product,
      stockQty: nextStockQty,
      reservedQty: nextReserved,
      stockStatus: resolveStockStatus({
        ...product,
        stockQty: nextStockQty,
        reservedQty: nextReserved
      }),
      updatedAt: nowIso()
    };
  }

  reservation.status = RESERVATION_STATUSES.CONSUMED;
  reservation.consumedAt = nowIso();
  return true;
}

function cleanupExpiredReservations(authStore, catalogStore) {
  let changed = false;

  for (const reservation of ensureArray(authStore.stockReservations)) {
    if (reservation.status !== RESERVATION_STATUSES.ACTIVE) {
      continue;
    }
    if (Date.parse(reservation.expiresAt) <= Date.now()) {
      const expired = expireReservationInternal(catalogStore, reservation);
      if (expired) {
        changed = true;
      }
    }
  }

  return changed;
}

function reserveStockForCheckout(authStore, catalogStore, input) {
  for (const line of input.lines) {
    const index = catalogStore.products.findIndex((row) => row.id === line.productId);
    if (index < 0) {
      throw new HttpError(409, "One or more cart items are unavailable.");
    }

    const product = catalogStore.products[index];
    const availableQty = computeEffectiveAvailableQty(product, 0);
    if (!product.allowBackorder && Number(line.qty || 0) > availableQty) {
      throw new HttpError(409, "Requested quantity is not available right now.");
    }
  }

  for (const line of input.lines) {
    const index = catalogStore.products.findIndex((row) => row.id === line.productId);
    const product = catalogStore.products[index];
    const nextReservedQty = Number(product.reservedQty || 0) + Number(line.qty || 0);

    catalogStore.products[index] = {
      ...product,
      reservedQty: nextReservedQty,
      stockStatus: resolveStockStatus({
        ...product,
        reservedQty: nextReservedQty
      }),
      updatedAt: nowIso()
    };
  }

  const reservation = {
    id: generateId("reserve"),
    checkoutSessionId: input.checkoutSessionId,
    ownerType: input.owner.ownerType,
    ownerId: input.owner.ownerId,
    status: RESERVATION_STATUSES.ACTIVE,
    items: input.lines.map((line) => ({
      productId: line.productId,
      qty: Number(line.qty || 0)
    })),
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + input.ttlMinutes * 60 * 1000).toISOString(),
    releasedAt: null,
    consumedAt: null
  };

  authStore.stockReservations.push(reservation);
  return reservation;
}

function buildCartItemsFromSession(session) {
  return ensureArray(session?.cart?.items).map((line) => ({
    productId: line.productId,
    qty: Number(line.qty || 0)
  }));
}

function sanitizeLegacyCartForAuth(owner, cart) {
  if (owner.ownerType === CART_OWNER_TYPES.CUSTOMER) {
    return {
      userId: owner.ownerId,
      items: ensureArray(cart?.items).map((item) => ({
        productId: item.productId,
        qty: Number(item.qty || 0)
      })),
      updatedAt: cart?.updatedAt || null
    };
  }

  return {
    sessionId: owner.ownerId,
    items: ensureArray(cart?.items).map((item) => ({
      productId: item.productId,
      qty: Number(item.qty || 0)
    })),
    updatedAt: cart?.updatedAt || null
  };
}

function resolveShareByToken(authStore, shareToken) {
  const shareTokenHash = hashValue(shareToken);
  const share = ensureArray(authStore.cartShares).find(
    (row) => row.tokenHash === shareTokenHash && row.isActive !== false
  );

  if (!share) {
    throw new HttpError(404, "Shared cart not found.");
  }

  if (Date.parse(share.expiresAt) <= Date.now()) {
    share.isActive = false;
    share.expiredAt = nowIso();
    throw new HttpError(410, "Shared cart link is expired.");
  }

  return share;
}

function assertCheckoutOwnership(session, owner) {
  if (!session) {
    throw new HttpError(404, "Checkout session not found.");
  }

  if (session.ownerType !== owner.ownerType || session.ownerId !== owner.ownerId) {
    throw new HttpError(403, "Checkout session is not accessible for this cart owner.");
  }
}

function generateOrderNo(authStore) {
  const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const counter = ensureArray(authStore.orders).length + 1;
  return `JNX-ORD-${prefix}-${String(counter).padStart(5, "0")}`;
}

function findOrderById(authStore, orderId) {
  return ensureArray(authStore.orders).find((order) => order.id === orderId);
}

function createOrderFromSession(authStore, session, options = {}) {
  const paymentStatus = options.paymentStatus || "paid";
  const orderStatus = options.orderStatus || "placed";
  const customerSnapshot = options.customerPricingContext || session.customerSnapshot || null;
  const isB2BOrderRequest = options.orderFlow === "b2b_offline_request";
  const shipmentStatus =
    options.shipmentStatus ||
    (session.shippingMethod === SHIPPING_METHODS.SELF_PICKUP
      ? "ready_for_pickup"
      : "pending_packing");
  const billingAddress = enrichOrderAddressSnapshot(
    session.billingAddress || {},
    customerSnapshot
  );
  const shippingAddress = enrichOrderAddressSnapshot(
    session.shippingAddress || {},
    customerSnapshot
  );

  return {
    id: generateId("order"),
    orderNo: generateOrderNo(authStore),
    checkoutSessionId: session.id,
    ownerType: session.ownerType,
    ownerId: session.ownerId,
    userId:
      session.ownerType === CART_OWNER_TYPES.CUSTOMER ? session.ownerId : null,
    customerType: customerSnapshot?.customerType || "retail",
    priceGroup: customerSnapshot?.priceGroup || "",
    isB2BApproved: Boolean(customerSnapshot?.isB2BApproved),
    companyName:
      billingAddress.companyName ||
      shippingAddress.companyName ||
      customerSnapshot?.companyName ||
      "",
    gstin:
      billingAddress.gstin ||
      shippingAddress.gstin ||
      customerSnapshot?.gstin ||
      "",
    creditAllowed: Boolean(customerSnapshot?.creditAllowed),
    bankTransferOnly: Boolean(customerSnapshot?.bankTransferOnly),
    pickupAllowed: Boolean(customerSnapshot?.pickupAllowed),
    orderMode: customerSnapshot?.orderMode || ORDER_MODES.ONLINE,
    isB2BOrderRequest,
    requiresAdminApproval: Boolean(options.requiresAdminApproval),
    items: session.cart.items.map((item) => ({
      productId: item.productId,
      title: item.title,
      sku: item.sku,
      hsnCode: item.hsnCode || "",
      qty: item.qty,
      finalUnitPrice: item.finalUnitPriceAfterDiscount,
      priceSource: item.priceSource || "base",
      bulkApplied: Boolean(item.bulkApplied),
      bulkRule: item.bulkRule || null,
      gstRate: item.gstRate,
      taxableValue: item.taxableValue,
      gstAmount: item.gstAmount,
      lineTotal: item.lineTotal
    })),
    productSubtotal: Number(session.cart.pricing.productSubtotal || 0),
    discountAmount: Number(session.cart.pricing.discountAmount || 0),
    taxableValue: Number(session.cart.pricing.taxableValue || 0),
    gstTotal: Number(session.cart.pricing.gstTotal || 0),
    shippingCharge: Number(session.cart.pricing.shippingCharge || 0),
    roundOff: Number(session.cart.pricing.roundOff || 0),
    grandTotal: Number(session.cart.pricing.grandTotal || 0),
    paymentStatus,
    orderStatus,
    shipmentStatus,
    invoiceId: null,
    paymentMethod: session.paymentMethod,
    shippingMethod: session.shippingMethod,
    billingAddress,
    shippingAddress,
    orderRequestReceivedAt: isB2BOrderRequest ? nowIso() : null,
    approvedAt: null,
    approvedBy: null,
    paymentVerifiedAt: null,
    createdAt: nowIso()
  };
}

function resolveNotificationEmail(addressA, addressB) {
  const primary = String(addressA?.email || "")
    .trim()
    .toLowerCase();
  if (primary) {
    return primary;
  }

  return String(addressB?.email || "")
    .trim()
    .toLowerCase();
}

function resolveNotificationCustomerName(addressA, addressB) {
  return (
    addressA?.companyName ||
    addressA?.name ||
    addressB?.companyName ||
    addressB?.name ||
    "Customer"
  );
}

function formatNotificationItems(items) {
  return ensureArray(items)
    .map((item) => `${item.title || item.productId} x${Number(item.qty || 0)}`)
    .join(", ");
}

async function notifyOrderPlaced(order, invoice) {
  return safeSendTemplateNotification({
    templateKey: "order_placed",
    toEmail: resolveNotificationEmail(order.billingAddress, order.shippingAddress),
    invoiceId: invoice?.id || order.invoiceId || null,
    relatedResourceType: "order",
    relatedResourceId: order.id,
    variables: {
      customerName: resolveNotificationCustomerName(
        order.billingAddress,
        order.shippingAddress
      ),
      orderNo: order.orderNo || "",
      invoiceNo: invoice?.invoiceNumber || order.invoiceNumber || "",
      cartItems: formatNotificationItems(order.items)
    }
  });
}

async function notifyPaymentFailure(session, attempt) {
  return safeSendTemplateNotification({
    templateKey: "payment_failed",
    toEmail: resolveNotificationEmail(session.billingAddress, session.shippingAddress),
    relatedResourceType: "payment_attempt",
    relatedResourceId: attempt?.id || session.id,
    variables: {
      customerName: resolveNotificationCustomerName(
        session.billingAddress,
        session.shippingAddress
      ),
      orderNo: "",
      paymentLink: attempt?.gatewayPaymentLink || "",
      cartItems: formatNotificationItems(session.cart?.items)
    }
  });
}

function clearOwnerCart(authStore, owner) {
  const cart = ensureCartRecord(authStore, owner, true);
  cart.items = [];
  cart.updatedAt = nowIso();
}

async function persistStores(authStore, catalogStore, options = {}) {
  if (options.writeCatalog) {
    await writeCatalogStore(catalogStore);
  }
  if (options.writeAuth) {
    await writeAuthStore(authStore);
  }
  if (options.writePayment && options.paymentStore) {
    await writePaymentStore(options.paymentStore);
  }
}

async function getCart(context, query) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: query.sessionId || context.sessionId || null
  });

  const [authStore, catalogStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);
  const customerPricingContext = resolveCustomerPricingContextForOwner(authStore, owner);

  let changed = cleanupExpiredReservations(authStore, catalogStore);

  const cart = ensureCartRecord(authStore, owner, true);
  const validItems = [];
  const lines = [];

  for (const item of ensureArray(cart.items)) {
    try {
      const line = buildCartLineFromItem(catalogStore, item, {
        enforceStockCheck: false,
        customerPricingContext
      });
      validItems.push({
        productId: item.productId,
        qty: Number(item.qty || 0)
      });
      lines.push(line);
    } catch (_error) {
      changed = true;
    }
  }

  if (validItems.length !== ensureArray(cart.items).length) {
    cart.items = validItems;
    cart.updatedAt = nowIso();
    changed = true;
  }

  const pricing = await calculatePricing(
    lines,
    query.paymentMethod,
    query.shippingMethod,
    {
      pincode: query.shippingPincode,
      stateCode: query.shippingStateCode,
      state: query.shippingState
    },
    shippingStore,
    paymentStore
  );
  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  const cartView = buildCartView(owner, cart, lines, pricing);
  await trackCartSaved(owner, cartView);
  return cartView;
}

async function addCartItem(context, payload) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: payload.sessionId || context.sessionId || null
  });

  const [authStore, catalogStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);
  const customerPricingContext = resolveCustomerPricingContextForOwner(authStore, owner);

  let changed = cleanupExpiredReservations(authStore, catalogStore);

  const cart = ensureCartRecord(authStore, owner, true);
  const existing = cart.items.find((item) => item.productId === payload.productId);
  if (existing) {
    existing.qty = Number(existing.qty || 0) + Number(payload.qty || 0);
  } else {
    cart.items.push({
      productId: payload.productId,
      qty: Number(payload.qty || 0)
    });
  }

  const lines = buildStrictCartLines(catalogStore, cart.items, {
    enforceStockCheck: true,
    customerPricingContext
  });

  cart.updatedAt = nowIso();
  changed = true;

  const pricing = await calculatePricing(
    lines,
    PAYMENT_METHODS.ONLINE,
    SHIPPING_METHODS.STANDARD,
    {},
    shippingStore,
    paymentStore
  );

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  const cartView = buildCartView(owner, cart, lines, pricing);
  await trackCartSaved(owner, cartView);
  return cartView;
}

async function updateCartItem(context, productId, payload) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: payload.sessionId || context.sessionId || null
  });

  const [authStore, catalogStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);
  const customerPricingContext = resolveCustomerPricingContextForOwner(authStore, owner);

  let changed = cleanupExpiredReservations(authStore, catalogStore);

  const cart = ensureCartRecord(authStore, owner, true);
  const index = cart.items.findIndex((item) => item.productId === productId);
  if (index < 0) {
    throw new HttpError(404, "Cart item not found.");
  }

  cart.items[index] = {
    productId,
    qty: Number(payload.qty || 0)
  };

  const lines = buildStrictCartLines(catalogStore, cart.items, {
    enforceStockCheck: true,
    customerPricingContext
  });
  cart.updatedAt = nowIso();
  changed = true;

  const pricing = await calculatePricing(
    lines,
    PAYMENT_METHODS.ONLINE,
    SHIPPING_METHODS.STANDARD,
    {},
    shippingStore,
    paymentStore
  );

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  const cartView = buildCartView(owner, cart, lines, pricing);
  await trackCartSaved(owner, cartView);
  return cartView;
}

async function deleteCartItem(context, productId, query) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: query.sessionId || context.sessionId || null
  });

  const [authStore, catalogStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);
  const customerPricingContext = resolveCustomerPricingContextForOwner(authStore, owner);

  let changed = cleanupExpiredReservations(authStore, catalogStore);
  const cart = ensureCartRecord(authStore, owner, true);
  const previousLength = cart.items.length;
  cart.items = cart.items.filter((item) => item.productId !== productId);

  if (cart.items.length === previousLength) {
    throw new HttpError(404, "Cart item not found.");
  }

  cart.updatedAt = nowIso();
  changed = true;
  const lines = buildStrictCartLines(catalogStore, cart.items, {
    enforceStockCheck: true,
    customerPricingContext
  });
  const pricing = await calculatePricing(
    lines,
    PAYMENT_METHODS.ONLINE,
    SHIPPING_METHODS.STANDARD,
    {},
    shippingStore,
    paymentStore
  );

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  return buildCartView(owner, cart, lines, pricing);
}

async function mergeGuestCartIntoCustomer(customerId, guestSessionId) {
  const owner = {
    ownerType: CART_OWNER_TYPES.CUSTOMER,
    ownerId: customerId
  };

  const [authStore, catalogStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);
  const customerPricingContext = resolveCustomerPricingContextForOwner(authStore, owner);

  let changed = cleanupExpiredReservations(authStore, catalogStore);

  const userCart = ensureCartRecord(authStore, owner, true);
  const guestCart = ensureCartRecord(
    authStore,
    {
      ownerType: CART_OWNER_TYPES.GUEST,
      ownerId: guestSessionId
    },
    false
  );

  const normalizeValidItems = (items) => {
    const rows = [];
    for (const item of ensureArray(items)) {
      try {
        buildCartLineFromItem(catalogStore, item, {
          enforceStockCheck: false,
          customerPricingContext
        });
        rows.push({
          productId: item.productId,
          qty: Number(item.qty || 0)
        });
      } catch (_error) {
        changed = true;
      }
    }
    return rows;
  };

  const cleanUserItems = normalizeValidItems(userCart.items);
  const cleanGuestItems = normalizeValidItems(guestCart?.items || []);
  if (cleanUserItems.length !== ensureArray(userCart.items).length) {
    userCart.items = cleanUserItems;
    userCart.updatedAt = nowIso();
  }
  if (guestCart && cleanGuestItems.length !== ensureArray(guestCart.items).length) {
    guestCart.items = cleanGuestItems;
    guestCart.updatedAt = nowIso();
  }

  if (!guestCart || guestCart.items.length === 0) {
    const lines = buildStrictCartLines(catalogStore, cleanUserItems, {
      enforceStockCheck: true,
      customerPricingContext
    });
    const pricing = await calculatePricing(
      lines,
      PAYMENT_METHODS.ONLINE,
      SHIPPING_METHODS.STANDARD,
      {},
      shippingStore,
      paymentStore
    );
    if (changed) {
      await persistStores(authStore, catalogStore, {
        writeAuth: true,
        writeCatalog: true
      });
    }
    const cartView = buildCartView(owner, userCart, lines, pricing);
    await trackCartSaved(owner, cartView);
    return {
      merged: false,
      cart: cartView
    };
  }

  const combinedMap = new Map();
  for (const item of cleanUserItems) {
    combinedMap.set(item.productId, Number(item.qty || 0));
  }
  for (const item of cleanGuestItems) {
    combinedMap.set(
      item.productId,
      Number(combinedMap.get(item.productId) || 0) + Number(item.qty || 0)
    );
  }

  const combinedItems = [...combinedMap.entries()].map(([productId, qty]) => ({
    productId,
    qty
  }));
  const lines = buildStrictCartLines(catalogStore, combinedItems, {
    enforceStockCheck: true,
    customerPricingContext
  });

  userCart.items = combinedItems;
  userCart.updatedAt = nowIso();
  authStore.guestCarts = authStore.guestCarts.filter(
    (row) => row.sessionId !== guestSessionId
  );
  changed = true;

  const pricing = await calculatePricing(
    lines,
    PAYMENT_METHODS.ONLINE,
    SHIPPING_METHODS.STANDARD,
    {},
    shippingStore,
    paymentStore
  );

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  const cartView = buildCartView(owner, userCart, lines, pricing);
  await trackCartSaved(owner, cartView);

  return {
    merged: true,
    cart: cartView
  };
}

async function createCartShare(context, payload) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: payload.sessionId || context.sessionId || null
  });

  const [authStore, catalogStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);
  const customerPricingContext = resolveCustomerPricingContextForOwner(authStore, owner);

  let changed = cleanupExpiredReservations(authStore, catalogStore);
  const cart = ensureCartRecord(authStore, owner, true);
  const lines = buildStrictCartLines(catalogStore, cart.items, {
    enforceStockCheck: true,
    customerPricingContext
  });

  if (lines.length === 0) {
    throw new HttpError(400, "Cart is empty. Add products before sharing.");
  }

  const shareToken = crypto.randomBytes(24).toString("hex");
  const shareRecord = {
    id: generateId("cart_share"),
    tokenHash: hashValue(shareToken),
    sourceOwnerType: owner.ownerType,
    sourceOwnerId: owner.ownerId,
    items: cart.items.map((item) => ({
      productId: item.productId,
      qty: Number(item.qty || 0)
    })),
    isActive: true,
    usedCount: 0,
    createdAt: nowIso(),
    expiresAt: new Date(
      Date.now() + Number(payload.expiresInMinutes || 1440) * 60 * 1000
    ).toISOString(),
    lastClaimedAt: null
  };

  authStore.cartShares.push(shareRecord);
  changed = true;

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  return {
    shareId: shareRecord.id,
    shareToken,
    shareUrl: `${env.publicBaseUrl}/cart/share/${shareToken}`,
    sourceOwnerType: owner.ownerType,
    expiresAt: shareRecord.expiresAt,
    itemCount: lines.reduce((sum, line) => sum + Number(line.qty || 0), 0)
  };
}

async function getSharedCart(shareToken) {
  const [authStore, catalogStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);

  let changed = cleanupExpiredReservations(authStore, catalogStore);
  let share;
  try {
    share = resolveShareByToken(authStore, shareToken);
  } catch (error) {
    if (error.statusCode === 410) {
      changed = true;
      await persistStores(authStore, catalogStore, {
        writeAuth: true,
        writeCatalog: true
      });
    }
    throw error;
  }

  const shareOwner = {
    ownerType: share?.sourceOwnerType,
    ownerId: share?.sourceOwnerId
  };
  const customerPricingContext = resolveCustomerPricingContextForOwner(authStore, shareOwner);

  const lines = buildStrictCartLines(catalogStore, share.items, {
    enforceStockCheck: false,
    customerPricingContext
  });
  const pricing = await calculatePricing(
    lines,
    PAYMENT_METHODS.ONLINE,
    SHIPPING_METHODS.STANDARD,
    {},
    shippingStore,
    paymentStore
  );

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  return {
    shareId: share.id,
    sourceOwnerType: share.sourceOwnerType,
    expiresAt: share.expiresAt,
    usedCount: Number(share.usedCount || 0),
    cart: sanitizeCartView({
      ownerType: share.sourceOwnerType,
      ownerId: share.sourceOwnerId,
      updatedAt: share.createdAt,
      itemCount: pricing.itemCount,
      items: lines,
      pricing
    })
  };
}

async function claimSharedCart(context, shareToken, payload) {
  const targetOwner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: payload.targetSessionId || context.sessionId || null
  });

  const [authStore, catalogStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);
  const customerPricingContext = resolveCustomerPricingContextForOwner(
    authStore,
    targetOwner
  );

  let changed = cleanupExpiredReservations(authStore, catalogStore);
  let share;
  try {
    share = resolveShareByToken(authStore, shareToken);
  } catch (error) {
    if (error.statusCode === 410) {
      changed = true;
      await persistStores(authStore, catalogStore, {
        writeAuth: true,
        writeCatalog: true
      });
    }
    throw error;
  }

  const targetCart = ensureCartRecord(authStore, targetOwner, true);
  const snapshotItems = ensureArray(share.items).map((item) => ({
    productId: item.productId,
    qty: Number(item.qty || 0)
  }));

  if (payload.mode === SHARE_CLAIM_MODES.REPLACE) {
    targetCart.items = snapshotItems;
  } else {
    const qtyMap = new Map();
    for (const item of ensureArray(targetCart.items)) {
      qtyMap.set(item.productId, Number(item.qty || 0));
    }
    for (const item of snapshotItems) {
      qtyMap.set(
        item.productId,
        Number(qtyMap.get(item.productId) || 0) + Number(item.qty || 0)
      );
    }
    targetCart.items = [...qtyMap.entries()].map(([productId, qty]) => ({
      productId,
      qty
    }));
  }

  const lines = buildStrictCartLines(catalogStore, targetCart.items, {
    enforceStockCheck: true,
    customerPricingContext
  });
  const pricing = await calculatePricing(
    lines,
    PAYMENT_METHODS.ONLINE,
    SHIPPING_METHODS.STANDARD,
    {},
    shippingStore,
    paymentStore
  );

  targetCart.updatedAt = nowIso();
  share.usedCount = Number(share.usedCount || 0) + 1;
  share.lastClaimedAt = nowIso();
  changed = true;

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  const cartView = buildCartView(targetOwner, targetCart, lines, pricing);
  await trackCartSaved(targetOwner, cartView);

  return {
    claimed: true,
    claimedTo: {
      ownerType: targetOwner.ownerType,
      ownerId: targetOwner.ownerId
    },
    cart: cartView
  };
}

async function startCheckout(context, payload) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: payload.sessionId || context.sessionId || null
  });

  const [authStore, catalogStore, shippingStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readShippingStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);
  const customerPricingContext = resolveCustomerPricingContextForOwner(authStore, owner);
  const usesOfflineOrderRequest = Boolean(customerPricingContext?.usesOfflineOrderRequest);

  let changed = cleanupExpiredReservations(authStore, catalogStore);
  const cart = ensureCartRecord(authStore, owner, true);

  if (!cart.items.length) {
    throw new HttpError(400, "Cart is empty.");
  }

  // Guard against placing an order for a cart that changed after this tab/device last
  // loaded it (e.g. another tab sharing the same guest/customer cart added or removed
  // items). The order must match what the submitting tab actually showed the buyer.
  if (
    payload.expectedCartUpdatedAt &&
    cart.updatedAt &&
    payload.expectedCartUpdatedAt !== cart.updatedAt
  ) {
    throw new HttpError(
      409,
      "Your cart changed since this page was last loaded (possibly in another tab). Please review the updated order summary and place the order again."
    );
  }

  const lines = buildStrictCartLines(catalogStore, cart.items, {
    enforceStockCheck: true,
    customerPricingContext
  });

  if (usesOfflineOrderRequest && payload.paymentMethod === PAYMENT_METHODS.ONLINE) {
    throw new HttpError(
      409,
      "Approved B2B accounts must place offline order requests instead of online payment orders."
    );
  }

  if (
    usesOfflineOrderRequest &&
    customerPricingContext?.bankTransferOnly &&
    payload.paymentMethod !== PAYMENT_METHODS.DIRECT_BANK_TRANSFER
  ) {
    throw new HttpError(
      409,
      "This account is configured for bank transfer payments only."
    );
  }

  if (
    usesOfflineOrderRequest &&
    payload.shippingMethod === SHIPPING_METHODS.SELF_PICKUP &&
    !customerPricingContext?.pickupAllowed
  ) {
    throw new HttpError(409, "Self pickup is not enabled for this customer account.");
  }

  if (
    payload.paymentMethod === PAYMENT_METHODS.DIRECT_BANK_TRANSFER ||
    payload.paymentMethod === PAYMENT_METHODS.MANUAL_UPI
  ) {
    const gatewayAvailability = ensureArray(paymentStore.gateways).find(
      (row) => row.code === payload.paymentMethod
    );
    if (!gatewayAvailability || gatewayAvailability.isEnabled === false) {
      throw new HttpError(409, "Selected manual payment method is currently unavailable.");
    }
  }

  const pricing = await calculatePricing(
    lines,
    payload.paymentMethod,
    payload.shippingMethod,
    payload.shippingAddress || {},
    shippingStore,
    paymentStore
  );

  const quoteLines = lines.filter((line) => line.quoteRequired);
  const now = nowIso();

  if (quoteLines.length > 0) {
    const quoteRequest = {
      id: generateId("quote_req"),
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      status: QUOTE_REQUEST_STATUSES.OPEN,
      items: quoteLines.map((line) => ({
        productId: line.productId,
        qty: line.qty,
        quoteRequiredAboveQty: line.quoteRequiredAboveQty
      })),
      createdAt: now,
      updatedAt: now
    };
    authStore.quoteRequests.push(quoteRequest);

    const session = {
      id: generateId("checkout"),
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      status: CHECKOUT_STATUSES.QUOTE_REQUIRED,
      paymentMethod: payload.paymentMethod,
      shippingMethod: payload.shippingMethod,
      quoteRequestId: quoteRequest.id,
      reservationId: null,
      reservationExpiresAt: null,
      orderId: null,
      customerSnapshot: customerPricingContext,
      cart: buildCartView(owner, cart, lines, pricing),
      billingAddress: enrichOrderAddressSnapshot(
        payload.billingAddress || {},
        customerPricingContext
      ),
      shippingAddress: enrichOrderAddressSnapshot(
        payload.shippingAddress || {},
        customerPricingContext
      ),
      createdAt: now,
      updatedAt: now
    };
    authStore.checkoutSessions.push(session);
    changed = true;

    await addActivityLog({
      action: "checkout.quote_required",
      actorId: owner.ownerId,
      actorRole: owner.ownerType,
      resourceType: "quote_request",
      resourceId: quoteRequest.id
    });

    if (changed) {
      await persistStores(authStore, catalogStore, {
        writeAuth: true,
        writeCatalog: true
      });
    }

    await trackCheckoutStarted(owner, session);

    return {
      checkoutBlocked: true,
      reason: "quote_required",
      quoteRequestId: quoteRequest.id,
      checkoutSession: sanitizeCheckoutSession(session)
    };
  }

  const session = {
    id: generateId("checkout"),
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    status: CHECKOUT_STATUSES.STARTED,
    paymentMethod: payload.paymentMethod,
    shippingMethod: payload.shippingMethod,
    quoteRequestId: null,
    reservationId: null,
    reservationExpiresAt: null,
    orderId: null,
    customerSnapshot: customerPricingContext,
    cart: buildCartView(owner, cart, lines, pricing),
    billingAddress: enrichOrderAddressSnapshot(
      payload.billingAddress || {},
      customerPricingContext
    ),
    shippingAddress: enrichOrderAddressSnapshot(
      payload.shippingAddress || {},
      customerPricingContext
    ),
    createdAt: now,
    updatedAt: now
  };

  let manualPaymentInstructions = null;
  let checkoutOrder = null;

  if (payload.paymentMethod === PAYMENT_METHODS.ONLINE) {
    const reservation = reserveStockForCheckout(authStore, catalogStore, {
      owner,
      checkoutSessionId: session.id,
      ttlMinutes: getReservationTtlMinutes(),
      lines
    });
    session.reservationId = reservation.id;
    session.reservationExpiresAt = reservation.expiresAt;
    session.status = CHECKOUT_STATUSES.PAYMENT_PENDING;
  } else if (
    payload.paymentMethod === PAYMENT_METHODS.DIRECT_BANK_TRANSFER ||
    payload.paymentMethod === PAYMENT_METHODS.MANUAL_UPI
  ) {
    checkoutOrder = createOrderFromSession(authStore, session, {
      paymentStatus: "pending",
      orderStatus: usesOfflineOrderRequest
        ? B2B_ORDER_STATUSES.AWAITING_ADMIN_APPROVAL
        : "payment_pending",
      shipmentStatus: "pending_packing",
      customerPricingContext,
      orderFlow: usesOfflineOrderRequest ? "b2b_offline_request" : "standard",
      requiresAdminApproval: usesOfflineOrderRequest
    });
    checkoutOrder.manualPaymentStatus = usesOfflineOrderRequest
      ? "approval_pending"
      : "awaiting_submission";
    authStore.orders.push(checkoutOrder);

    session.orderId = checkoutOrder.id;
    session.status = CHECKOUT_STATUSES.PAYMENT_PENDING;

    manualPaymentInstructions = usesOfflineOrderRequest
      ? null
      : getManualPaymentInstructions(payload.paymentMethod, paymentStore);
    clearOwnerCart(authStore, owner);
  }

  authStore.checkoutSessions.push(session);
  changed = true;

  await addActivityLog({
    action: "checkout.started",
    actorId: owner.ownerId,
    actorRole: owner.ownerType,
    resourceType: "checkout",
    resourceId: session.id
  });

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  await trackCheckoutStarted(owner, session, checkoutOrder);

  if (checkoutOrder?.isB2BOrderRequest) {
    await safeSendTemplateNotification({
      templateKey: "dealer_order_request_received",
      toEmail: resolveNotificationEmail(
        checkoutOrder.billingAddress,
        checkoutOrder.shippingAddress
      ),
      relatedResourceType: "order",
      relatedResourceId: checkoutOrder.id,
      variables: {
        customerName: resolveNotificationCustomerName(
          checkoutOrder.billingAddress,
          checkoutOrder.shippingAddress
        ),
        orderNo: checkoutOrder.orderNo || "",
        cartItems: formatNotificationItems(checkoutOrder.items)
      }
    });
  }

  return {
    checkoutBlocked: false,
    checkoutSession: sanitizeCheckoutSession(session),
    order:
      checkoutOrder === null
        ? null
        : {
            id: checkoutOrder.id,
            orderNo: checkoutOrder.orderNo,
            paymentStatus: checkoutOrder.paymentStatus,
            orderStatus: checkoutOrder.orderStatus,
            grandTotal: checkoutOrder.grandTotal
          },
    manualPaymentInstructions,
    reservation:
      session.reservationId === null
        ? null
        : sanitizeReservation(
            authStore.stockReservations.find((row) => row.id === session.reservationId)
          )
  };
}

async function getCheckoutSession(context, checkoutSessionId, query) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: query.sessionId || context.sessionId || null
  });

  const [authStore, catalogStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);

  const changed = cleanupExpiredReservations(authStore, catalogStore);
  const session = authStore.checkoutSessions.find((row) => row.id === checkoutSessionId);
  assertCheckoutOwnership(session, owner);

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  return sanitizeCheckoutSession(session);
}

async function getCheckoutFollowup(context, checkoutSessionId, query) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: query.sessionId || context.sessionId || null
  });

  const [authStore, invoiceStore, paymentStore, shippingStore] = await Promise.all([
    readAuthStore(),
    readInvoiceStore(),
    readPaymentStore(),
    readShippingStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);
  ensurePaymentStoreShape(paymentStore);
  ensureShippingStoreShape(shippingStore);

  const session = authStore.checkoutSessions.find((row) => row.id === checkoutSessionId);
  assertCheckoutOwnership(session, owner);

  const order = session.orderId ? findOrderById(authStore, session.orderId) : null;
  const shipment = order ? buildLatestShipmentMap(shippingStore).get(order.id) || null : null;
  const invoice = order ? buildInvoiceByOrderIdMap(invoiceStore).get(order.id) || null : null;
  const manualPaymentInstructions = shouldExposeManualPaymentInstructions(order)
    ? getManualPaymentInstructions(order.paymentMethod, paymentStore)
    : null;

  return {
    checkoutSession: sanitizeCheckoutSession(session),
    order:
      order === null
        ? null
        : buildCheckoutOrderFollowup(order, shipment, invoice, manualPaymentInstructions)
  };
}

async function downloadCheckoutInvoice(context, checkoutSessionId, query) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: query.sessionId || context.sessionId || null
  });

  const [authStore, invoiceStore] = await Promise.all([readAuthStore(), readInvoiceStore()]);
  ensurePhase7StoreShape(authStore);
  ensureInvoiceStoreShape(invoiceStore);

  const session = authStore.checkoutSessions.find((row) => row.id === checkoutSessionId);
  assertCheckoutOwnership(session, owner);

  const order = session.orderId ? findOrderById(authStore, session.orderId) : null;
  if (!order) {
    throw new HttpError(404, "Order is not available for this checkout session yet.");
  }

  const invoice = ensureArray(invoiceStore.invoices).find((row) => row.orderId === order.id);
  if (!invoice) {
    throw new HttpError(404, "Invoice is not generated for this order yet.");
  }

  return getInvoiceDownload(invoice.id);
}

async function createPaymentAttempt(context, payload) {
  const owner = resolveCartOwner({
    customerId: context.customerId,
    sessionId: payload.sessionId || context.sessionId || null
  });

  const [authStore, catalogStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);

  let changed = cleanupExpiredReservations(authStore, catalogStore);
  const session = authStore.checkoutSessions.find(
    (row) => row.id === payload.checkoutSessionId
  );
  assertCheckoutOwnership(session, owner);

  if (session.status === CHECKOUT_STATUSES.QUOTE_REQUIRED) {
    throw new HttpError(409, "Checkout requires quote approval.");
  }

  if (session.status === CHECKOUT_STATUSES.PAID) {
    throw new HttpError(409, "Checkout already paid.");
  }

  if (session.paymentMethod !== PAYMENT_METHODS.ONLINE) {
    throw new HttpError(
      409,
      "Payment attempt is supported only for online checkout sessions."
    );
  }

  let reservation = session.reservationId
    ? authStore.stockReservations.find((row) => row.id === session.reservationId)
    : null;

  const cartItems = buildCartItemsFromSession(session);
  if (cartItems.length === 0) {
    throw new HttpError(409, "Checkout cart is empty.");
  }

  if (!reservation || reservation.status !== RESERVATION_STATUSES.ACTIVE) {
    const customerPricingContext = session.customerSnapshot || null;
    const lines = buildStrictCartLines(catalogStore, cartItems, {
      enforceStockCheck: true,
      customerPricingContext
    });
    reservation = reserveStockForCheckout(authStore, catalogStore, {
      owner,
      checkoutSessionId: session.id,
      ttlMinutes: getReservationTtlMinutes(),
      lines
    });
    session.reservationId = reservation.id;
    session.reservationExpiresAt = reservation.expiresAt;
    changed = true;
  } else {
    const reservedByProduct = mapReservationItemsByProduct(reservation);
    buildStrictCartLines(catalogStore, cartItems, {
      enforceStockCheck: true,
      reservedByProduct,
      customerPricingContext: session.customerSnapshot || null
    });
  }

  const amount = Number(session.cart.pricing.grandTotal || 0);
  const attemptId = generateId("pay_attempt");
  const selectedGateway = resolveGatewayForPaymentAttempt(paymentStore, {
    requestedGateway: payload.gateway,
    amount
  });
  const gatewayProvider = createPaymentGateway(selectedGateway.code);
  const providerOrder = await gatewayProvider.createPaymentOrder({
    attemptId,
    orderId: session.orderId || session.id,
    checkoutSessionId: session.id,
    amount,
    currency: "INR",
    customerId: owner.ownerType === CART_OWNER_TYPES.CUSTOMER ? owner.ownerId : null,
    instructions: selectedGateway.instructions || {}
  });

  const attempt = {
    id: attemptId,
    checkoutSessionId: session.id,
    ownerType: session.ownerType,
    ownerId: session.ownerId,
    gateway: selectedGateway.code,
    status: PAYMENT_ATTEMPT_STATUSES.CREATED,
    amount,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    gatewayOrderId: providerOrder.gatewayOrderId || "",
    gatewayPaymentLink: providerOrder.paymentLink || "",
    gatewayTxnId: "",
    failureReason: ""
  };
  authStore.paymentAttempts.push(attempt);
  session.status = CHECKOUT_STATUSES.PAYMENT_ATTEMPT_CREATED;
  session.updatedAt = nowIso();
  changed = true;

  await addActivityLog({
    action: "payments.attempt.created",
    actorId: owner.ownerId,
    actorRole: owner.ownerType,
    resourceType: "payment_attempt",
    resourceId: attempt.id
  });

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true
    });
  }

  await trackPaymentAttemptCreated(owner, session, attempt);

  return {
    attemptId: attempt.id,
    checkoutSessionId: session.id,
    amount: attempt.amount,
    status: attempt.status,
    gateway: attempt.gateway,
    gatewayOrderId: attempt.gatewayOrderId || "",
    gatewayPaymentLink: attempt.gatewayPaymentLink || "",
    gatewayProviderKey: providerOrder.keyId || "",
    gatewayMode: providerOrder.mode || "",
    reservation: sanitizeReservation(reservation)
  };
}

async function processPaymentWebhook(gatewayCode, payload, rawBody, signature) {
  const normalizedGatewayCode = String(gatewayCode || "mock_online")
    .trim()
    .toLowerCase();

  // The mock gateway performs no signature verification — it must never be reachable
  // in production, where it would let anyone confirm a real payment attempt as paid.
  if (env.nodeEnv === "production" && (normalizedGatewayCode === "mock_online" || normalizedGatewayCode === "mock")) {
    throw new HttpError(403, "Mock payment gateway is disabled in production.");
  }

  const [authStore, catalogStore, paymentStore] = await Promise.all([
    readAuthStore(),
    readCatalogStore(),
    readPaymentStore()
  ]);
  ensurePhase7StoreShape(authStore);
  ensurePaymentStoreShape(paymentStore);

  let changed = cleanupExpiredReservations(authStore, catalogStore);

  const gatewayProvider = createPaymentGateway(normalizedGatewayCode);
  const normalizedPayload = await gatewayProvider.handleWebhook(payload || {}, rawBody, signature);
  const attemptId = String(normalizedPayload.attemptId || payload.attemptId || "").trim();
  const status = String(normalizedPayload.status || payload.status || "")
    .trim()
    .toLowerCase();

  if (!attemptId || !["success", "failed"].includes(status)) {
    throw new HttpError(400, "Invalid payment webhook payload.");
  }

  const webhookEventId =
    String(normalizedPayload.eventId || payload.eventId || "").trim() ||
    `${attemptId}:${status}:${String(normalizedPayload.gatewayTxnId || payload.gatewayTxnId || "")}`;
  const duplicateEvent = ensureArray(paymentStore.processedWebhooks).find(
    (event) =>
      event.gateway === normalizedGatewayCode &&
      event.eventId &&
      event.eventId === webhookEventId
  );
  if (duplicateEvent) {
    return {
      handled: true,
      duplicate: true,
      attemptId,
      status
    };
  }

  const attempt = authStore.paymentAttempts.find((row) => row.id === attemptId);
  if (!attempt) {
    throw new HttpError(404, "Payment attempt not found.");
  }

  const session = authStore.checkoutSessions.find(
    (row) => row.id === attempt.checkoutSessionId
  );
  if (!session) {
    throw new HttpError(404, "Checkout session not found for payment attempt.");
  }

  const reservation = session.reservationId
    ? authStore.stockReservations.find((row) => row.id === session.reservationId)
    : null;

  // A webhook may only confirm an attempt created for the SAME gateway. The previous
  // razorpay<->mock_online cross-match let anyone hit the unsigned mock webhook with a
  // guessed/leaked attemptId and mark a real Razorpay order paid without paying.
  const gatewayMatch = attempt.gateway === normalizedGatewayCode;
  if (!gatewayMatch) {
    throw new HttpError(409, "Webhook gateway does not match payment attempt gateway.");
  }

  paymentStore.processedWebhooks.push({
    id: generateId("pg_webhook"),
    gateway: normalizedGatewayCode,
    eventId: webhookEventId,
    attemptId,
    status,
    receivedAt: nowIso()
  });
  changed = true;

  if (status === "failed") {
    if (attempt.status !== PAYMENT_ATTEMPT_STATUSES.FAILED) {
      attempt.status = PAYMENT_ATTEMPT_STATUSES.FAILED;
      attempt.failureReason =
        normalizedPayload.failureReason || payload.failureReason || "payment_failed";
      attempt.updatedAt = nowIso();
      changed = true;
    }

    if (reservation && reservation.status === RESERVATION_STATUSES.ACTIVE) {
      const released = releaseReservationInternal(
        catalogStore,
        reservation,
        "payment_failed",
        RESERVATION_STATUSES.RELEASED
      );
      if (released) {
        changed = true;
      }
    }

    session.status = CHECKOUT_STATUSES.PAYMENT_FAILED;
    session.updatedAt = nowIso();
    changed = true;

    if (changed) {
      await persistStores(authStore, catalogStore, {
        writeAuth: true,
        writeCatalog: true,
        writePayment: true,
        paymentStore
      });
    }

    await trackPaymentFailed(
      {
        ownerType: session.ownerType,
        ownerId: session.ownerId
      },
      session,
      attempt,
      attempt.failureReason
    );
    await notifyPaymentFailure(session, attempt);

    await addActivityLog({
      action: "payments.webhook.failed",
      actorId: session.ownerId,
      actorRole: session.ownerType,
      resourceType: "payment_attempt",
      resourceId: attempt.id
    });

    return {
      handled: true,
      status: "failed",
      attemptId: attempt.id,
      reservationStatus: reservation ? reservation.status : null
    };
  }

  if (attempt.status === PAYMENT_ATTEMPT_STATUSES.SUCCESS) {
    const existingOrder = session.orderId ? findOrderById(authStore, session.orderId) : null;

    if (changed) {
      await persistStores(authStore, catalogStore, {
        writeAuth: true,
        writeCatalog: true,
        writePayment: true,
        paymentStore
      });
    }

    const invoiceResult =
      existingOrder?.id
        ? await ensureInvoiceForOrder(
            existingOrder.id,
            { id: "system", role: "system" },
            { source: "payment_webhook_duplicate" }
          )
        : null;

    return {
      handled: true,
      status: "success",
      attemptId: attempt.id,
      orderId: existingOrder?.id || session.orderId || null,
      invoiceId: invoiceResult?.invoice?.id || existingOrder?.invoiceId || null
    };
  }

  const cartItems = buildCartItemsFromSession(session);
  const reservedByProduct = mapReservationItemsByProduct(reservation);
  const lines = buildStrictCartLines(catalogStore, cartItems, {
    enforceStockCheck: true,
    reservedByProduct,
    customerPricingContext: session.customerSnapshot || null
  });

  let activeReservation = reservation;
  if (!activeReservation || activeReservation.status !== RESERVATION_STATUSES.ACTIVE) {
    activeReservation = reserveStockForCheckout(authStore, catalogStore, {
      owner: {
        ownerType: session.ownerType,
        ownerId: session.ownerId
      },
      checkoutSessionId: session.id,
      ttlMinutes: getReservationTtlMinutes(),
      lines
    });
    session.reservationId = activeReservation.id;
    session.reservationExpiresAt = activeReservation.expiresAt;
    changed = true;
  }

  const consumed = consumeReservationInternal(catalogStore, activeReservation);
  if (consumed) {
    changed = true;
  }

  attempt.status = PAYMENT_ATTEMPT_STATUSES.SUCCESS;
  attempt.gatewayTxnId = normalizedPayload.gatewayTxnId || payload.gatewayTxnId || "";
  attempt.updatedAt = nowIso();
  session.status = CHECKOUT_STATUSES.PAID;
  session.updatedAt = nowIso();

  let order = session.orderId ? findOrderById(authStore, session.orderId) : null;
  if (order) {
    order.paymentStatus = "paid";
    order.orderStatus = "placed";
    order.gatewayTxnId = attempt.gatewayTxnId;
    order.paymentVerifiedAt = nowIso();
  } else {
    order = createOrderFromSession(authStore, session, {
      paymentStatus: "paid",
      orderStatus: "placed"
    });
    order.gatewayTxnId = attempt.gatewayTxnId;
    order.paymentVerifiedAt = nowIso();
    authStore.orders.push(order);
    session.orderId = order.id;
  }

  clearOwnerCart(authStore, {
    ownerType: session.ownerType,
    ownerId: session.ownerId
  });

  changed = true;

  if (changed) {
    await persistStores(authStore, catalogStore, {
      writeAuth: true,
      writeCatalog: true,
      writePayment: true,
      paymentStore
    });
  }

  await trackRecoveryCompleted(
    {
      ownerType: session.ownerType,
      ownerId: session.ownerId
    },
    session.id,
    order.id
  );

  const invoiceResult = await ensureInvoiceForOrder(
    order.id,
    { id: "system", role: "system" },
    { source: "payment_webhook_success" }
  );
  await notifyOrderPlaced(order, invoiceResult.invoice);

  await addActivityLog({
    action: "payments.webhook.success",
    actorId: session.ownerId,
    actorRole: session.ownerType,
    resourceType: "order",
    resourceId: order.id
  });

  return {
    handled: true,
    status: "success",
    attemptId: attempt.id,
    order: {
      id: order.id,
      orderNo: order.orderNo,
      grandTotal: order.grandTotal
    },
    invoice: invoiceResult.invoice,
    reservationStatus: activeReservation.status
  };
}

async function processMockPaymentWebhook(payload) {
  return processPaymentWebhook("mock_online", payload);
}

async function getGuestCartLegacy(sessionId) {
  const authStore = await readAuthStore();
  ensurePhase7StoreShape(authStore);
  const owner = {
    ownerType: CART_OWNER_TYPES.GUEST,
    ownerId: sessionId
  };
  const cart = ensureCartRecord(authStore, owner, false);
  return sanitizeLegacyCartForAuth(owner, cart);
}

async function getCustomerCartLegacy(customerId) {
  const authStore = await readAuthStore();
  ensurePhase7StoreShape(authStore);
  const owner = {
    ownerType: CART_OWNER_TYPES.CUSTOMER,
    ownerId: customerId
  };
  const cart = ensureCartRecord(authStore, owner, false);
  return sanitizeLegacyCartForAuth(owner, cart);
}

async function addGuestCartItemLegacy(payload) {
  const authStore = await readAuthStore();
  ensurePhase7StoreShape(authStore);

  const owner = {
    ownerType: CART_OWNER_TYPES.GUEST,
    ownerId: payload.sessionId
  };
  const cart = ensureCartRecord(authStore, owner, true);
  const existing = cart.items.find((item) => item.productId === payload.productId);

  if (existing) {
    existing.qty = Number(existing.qty || 0) + Number(payload.qty || 0);
  } else {
    cart.items.push({
      productId: payload.productId,
      qty: Number(payload.qty || 0)
    });
  }

  cart.updatedAt = nowIso();
  await writeAuthStore(authStore);
  return sanitizeLegacyCartForAuth(owner, cart);
}

module.exports = {
  getCart,
  addCartItem,
  updateCartItem,
  deleteCartItem,
  mergeGuestCartIntoCustomer,
  createCartShare,
  getSharedCart,
  claimSharedCart,
  startCheckout,
  getCheckoutSession,
  getCheckoutFollowup,
  downloadCheckoutInvoice,
  createPaymentAttempt,
  processPaymentWebhook,
  processMockPaymentWebhook,
  getGuestCartLegacy,
  getCustomerCartLegacy,
  addGuestCartItemLegacy
};
