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

// Freight/courier services (SAC 996812) are taxed at a fixed rate under GST,
// unlike goods whose rate varies by HSN code -- shipping should never use a
// cart's blended product GST rate. Shared by calculatePricing (tax amount)
// and invoice generation (the shipping line item's own HSN + rate), so both
// always agree.
const SHIPPING_TAX = Object.freeze({
  HSN_CODE: "996812",
  GST_RATE: 18
});

// MDR (merchant discount rate) pass-through charge is itself a taxable
// supply of service (the payment-processing fee the merchant incurs, passed
// on to the buyer) -- SAC 997158 confirmed by the business's CA/accountant
// (2026-09-17). Shared by calculatePricing (amount) and invoice generation
// (the MDR line item's own HSN/SAC + rate), mirroring SHIPPING_TAX above.
const MDR_TAX = Object.freeze({
  SAC_CODE: "997158"
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
  FAILED: "failed",
  // Gateway captured the payment, but stock could no longer be reserved by
  // the time confirmation landed (reservation TTL expired and someone else
  // bought the item in the gap). Distinct from FAILED, which means the
  // customer was never actually charged -- this one needs a manual refund
  // or manual order creation, not a "payment declined, try again" message.
  CAPTURED_UNFULFILLED: "captured_unfulfilled"
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
    lineId: line.lineId || "",
    productId: line.productId,
    title: line.title,
    slug: line.slug,
    sku: line.sku,
    imageUrl: line.imageUrl || "",
    returnEligible: Boolean(line.returnEligible),
    showSoldAsIsBadge: Boolean(line.showSoldAsIsBadge),
    customization: Array.isArray(line.customization) ? line.customization : [],
    designUploadIds: Array.isArray(line.designUploadIds) ? line.designUploadIds : [],
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
    stockVisibility: "hide_quantity",
    shippingClass: line.shippingClass || "normal"
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
      // Order creation (createOrderFromSession) reads this straight off the
      // persisted checkout session's cart.pricing -- calculatePricing()
      // always computes it correctly and folds it into gstTotal/grandTotal,
      // but this sanitizer's pricing whitelist never carried it through, so
      // every order created from a normal checkout session had it silently
      // reset to 0 here, even though the customer was charged correctly.
      // Downstream, invoices.service.js reads order.shippingGstAmount to
      // split the shipping tax into CGST/SGST/IGST for the invoice and Tally
      // export -- with this missing, that breakdown understated tax by
      // exactly the GST on shipping for every affected order (confirmed
      // across August's invoices: 25 of 27 affected, only escaping it
      // because they'd separately been re-priced later via
      // recalculateOrderItems, the one code path that already set this
      // correctly). Grand Total itself was never wrong, only this field.
      shippingGstAmount: Number(cartView.pricing?.shippingGstAmount || 0),
      shippingCharge: Number(cartView.pricing?.shippingCharge || 0),
      roundOff: Number(cartView.pricing?.roundOff || 0),
      // Same whitelist trap that once dropped shippingGstAmount (see comment
      // above) -- calculatePricing() always computes these MDR fields
      // correctly, but they'd be silently reset to 0 here (and therefore in
      // every order created from this session) if not explicitly carried
      // through.
      mdrPercent: Number(cartView.pricing?.mdrPercent || 0),
      mdrGstPercent: Number(cartView.pricing?.mdrGstPercent || 0),
      mdrAmount: Number(cartView.pricing?.mdrAmount || 0),
      mdrGstAmount: Number(cartView.pricing?.mdrGstAmount || 0),
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
  MDR_TAX,
  SHIPPING_METHODS,
  SHIPPING_TAX,
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
