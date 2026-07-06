const CART_OWNER_TYPES = Object.freeze({
  GUEST: "guest",
  CUSTOMER: "customer"
});

const PAYMENT_METHODS = Object.freeze({
  ONLINE: "online",
  DIRECT_BANK_TRANSFER: "direct_bank_transfer",
  MANUAL_UPI: "manual_upi"
});

const SHIPPING_METHODS = Object.freeze({
  STANDARD: "standard",
  EXPRESS: "express",
  LOCAL_PICKUP: "local_pickup",
  SELF_PICKUP: "self_pickup",
  TRANSPORT: "transport",
  MANUAL_DELIVERY: "manual_delivery"
});

const CHECKOUT_STATUSES = Object.freeze({
  STARTED: "started",
  QUOTE_REQUIRED: "quote_required",
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_ATTEMPT_CREATED: "payment_attempt_created",
  PAYMENT_FAILED: "payment_failed",
  PAID: "paid",
  EXPIRED: "expired"
});

const RESERVATION_STATUSES = Object.freeze({
  ACTIVE: "active",
  RELEASED: "released",
  CONSUMED: "consumed",
  EXPIRED: "expired"
});

const PAYMENT_ATTEMPT_STATUSES = Object.freeze({
  CREATED: "created",
  SUCCESS: "success",
  FAILED: "failed"
});

const SHARE_CLAIM_MODES = Object.freeze({
  MERGE: "merge",
  REPLACE: "replace"
});

const QUOTE_REQUEST_STATUSES = Object.freeze({
  OPEN: "open",
  CONVERTED: "converted",
  CANCELLED: "cancelled"
});

function sanitizeCartLine(line) {
  return {
    productId: line.productId,
    title: line.title,
    slug: line.slug,
    sku: line.sku,
    imageUrl: line.imageUrl || "",
    hsnCode: line.hsnCode || "",
    qty: Number(line.qty || 0),
    moq: Number(line.moq || 1),
    gstRate: Number(line.gstRate || 0),
    priceIncludesGst: Boolean(line.priceIncludesGst),
    unitPrice: Number(line.unitPrice || 0),
    finalUnitPriceAfterDiscount: Number(line.finalUnitPriceAfterDiscount || line.unitPrice || 0),
    priceSource: line.priceSource || "base",
    compareAtUnitPrice:
      line.compareAtUnitPrice === null || line.compareAtUnitPrice === undefined
        ? null
        : Number(line.compareAtUnitPrice),
    discountAmount: Number(line.discountAmount || 0),
    taxableValue: Number(line.taxableValue || 0),
    gstAmount: Number(line.gstAmount || 0),
    lineTotal: Number(line.lineTotal || 0),
    bulkApplied: Boolean(line.bulkApplied),
    bulkRule: line.bulkRule || null,
    quoteRequired: Boolean(line.quoteRequired),
    quoteRequiredAboveQty:
      line.quoteRequiredAboveQty === null || line.quoteRequiredAboveQty === undefined
        ? null
        : Number(line.quoteRequiredAboveQty),
    availabilityStatus: line.availabilityStatus || "out_of_stock",
    stockVisibility: "hide_quantity"
  };
}

function sanitizeCartView(cartView) {
  return {
    ownerType: cartView.ownerType,
    ownerId: cartView.ownerId,
    updatedAt: cartView.updatedAt || null,
    itemCount: Number(cartView.itemCount || 0),
    items: Array.isArray(cartView.items)
      ? cartView.items.map(sanitizeCartLine)
      : [],
    pricing: {
      productSubtotal: Number(cartView.pricing?.productSubtotal || 0),
      discountAmount: Number(cartView.pricing?.discountAmount || 0),
      taxableValue: Number(cartView.pricing?.taxableValue || 0),
      gstTotal: Number(cartView.pricing?.gstTotal || 0),
      shippingCharge: Number(cartView.pricing?.shippingCharge || 0),
      roundOff: Number(cartView.pricing?.roundOff || 0),
      grandTotal: Number(cartView.pricing?.grandTotal || 0),
      paymentMethod: cartView.pricing?.paymentMethod || PAYMENT_METHODS.ONLINE,
      shippingMethod: cartView.pricing?.shippingMethod || SHIPPING_METHODS.STANDARD,
      shippingMeta: cartView.pricing?.shippingMeta
        ? {
            zone: cartView.pricing.shippingMeta.zone || "all_india",
            zoneLabel: cartView.pricing.shippingMeta.zoneLabel || "All India",
            totalWeightKg: Number(cartView.pricing.shippingMeta.totalWeightKg || 0),
            remoteExtraCharge: Number(
              cartView.pricing.shippingMeta.remoteExtraCharge || 0
            )
          }
        : undefined
    }
  };
}

function sanitizeCheckoutSession(session) {
  return {
    id: session.id,
    status: session.status,
    ownerType: session.ownerType,
    ownerId: session.ownerId,
    paymentMethod: session.paymentMethod,
    shippingMethod: session.shippingMethod,
    quoteRequestId: session.quoteRequestId || null,
    reservationId: session.reservationId || null,
    reservationExpiresAt: session.reservationExpiresAt || null,
    orderId: session.orderId || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    cart: sanitizeCartView(session.cart || {}),
    billingAddress: session.billingAddress || {},
    shippingAddress: session.shippingAddress || {}
  };
}

function sanitizeReservation(reservation) {
  return {
    id: reservation.id,
    checkoutSessionId: reservation.checkoutSessionId,
    ownerType: reservation.ownerType,
    ownerId: reservation.ownerId,
    status: reservation.status,
    expiresAt: reservation.expiresAt,
    createdAt: reservation.createdAt,
    releasedAt: reservation.releasedAt || null,
    consumedAt: reservation.consumedAt || null
  };
}

module.exports = {
  CART_OWNER_TYPES,
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  CHECKOUT_STATUSES,
  RESERVATION_STATUSES,
  PAYMENT_ATTEMPT_STATUSES,
  SHARE_CLAIM_MODES,
  QUOTE_REQUEST_STATUSES,
  sanitizeCartLine,
  sanitizeCartView,
  sanitizeCheckoutSession,
  sanitizeReservation
};
