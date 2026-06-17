const { PAYMENT_METHODS, SHIPPING_METHODS } = require("../cart-checkout/cart-checkout.model");
const { CUSTOMER_TYPES } = require("../customers/customers.model");

const WALKIN_PRICE_MODES = Object.freeze({
  RETAIL: "retail",
  DEALER: "dealer",
  STOCKIST: "stockist",
  CUSTOM: "custom"
});

const WALKIN_PAYMENT_METHODS = Object.freeze({
  CASH: "cash",
  DIRECT_BANK_TRANSFER: PAYMENT_METHODS.DIRECT_BANK_TRANSFER,
  MANUAL_UPI: PAYMENT_METHODS.MANUAL_UPI,
  CHEQUE: "cheque",
  ONLINE_PAYMENT_LINK: "online_payment_link",
  CREDIT_PAY_LATER: "credit_pay_later"
});

const WALKIN_ORDER_STATUSES = Object.freeze({
  WALKIN_ORDER_CREATED: "walkin_order_created",
  PAYMENT_PENDING: "payment_pending",
  PAID: "paid",
  INVOICE_GENERATED: "invoice_generated",
  READY_FOR_PICKUP: "ready_for_pickup",
  DISPATCHED: "dispatched",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
});

const WALKIN_ALLOWED_SHIPPING_METHODS = Object.freeze([
  SHIPPING_METHODS.SELF_PICKUP,
  SHIPPING_METHODS.STANDARD,
  SHIPPING_METHODS.EXPRESS,
  SHIPPING_METHODS.TRANSPORT,
  SHIPPING_METHODS.MANUAL_DELIVERY
]);

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeWalkInCustomer(customer) {
  const address = ensureArray(customer?.savedAddresses).find(
    (row) => row.isDefaultBilling || row.isDefaultShipping
  ) || ensureArray(customer?.savedAddresses)[0] || {};

  return {
    id: customer?.id || "",
    name: customer?.name || "",
    email: customer?.email || "",
    mobile: customer?.mobile || "",
    companyName: customer?.companyName || "",
    customerType: customer?.customerType || "retail",
    priceGroup: customer?.priceGroup || "",
    isB2BApproved: Boolean(customer?.isB2BApproved),
    creditAllowed: Boolean(customer?.creditAllowed),
    gstin: customer?.gstin || customer?.gstDetails?.gstin || "",
    address: {
      addressLine1: address.addressLine1 || "",
      addressLine2: address.addressLine2 || "",
      city: address.city || "",
      state: address.state || "",
      stateCode: address.stateCode || "",
      pincode: address.pincode || "",
      country: address.country || "India"
    }
  };
}

function sanitizeWalkInProduct(product, categoryName = "") {
  return {
    id: product.id,
    title: product.title,
    sku: product.sku,
    brand: product.brand || "",
    categoryId: product.categoryId || null,
    categoryName,
    hsnCode: product.hsnCode || "",
    gstRate: Number(product.gstRate || 0),
    basePrice: Number(product.basePrice || 0),
    salePrice: Number(product.salePrice || 0),
    bulkPricingEnabled: Boolean(product.bulkPricingEnabled),
    bulkPriceSlabs: ensureArray(product.bulkPriceSlabs).map((row) => ({
      minQty: Number(row.minQty || 0),
      unitPrice: Number(row.unitPrice || 0)
    })),
    priceGroupPrices: ensureArray(product.priceGroupPrices).map((row) => ({
      priceGroup: row.priceGroup || "",
      unitPrice: Number(row.unitPrice || 0)
    })),
    stockStatus: product.stockStatus || "out_of_stock",
    availableQty: Number(product.availableQty || 0),
    allowBackorder: Boolean(product.allowBackorder),
    isActive: Boolean(product.isActive)
  };
}

function sanitizeWalkInOrderSummary(order) {
  return {
    id: order.id,
    orderNo: order.orderNo || "",
    customerId: order.userId || "",
    customerName:
      order.billingAddress?.companyName ||
      order.billingAddress?.name ||
      order.shippingAddress?.companyName ||
      order.shippingAddress?.name ||
      "Customer",
    customerMobile:
      order.billingAddress?.mobile || order.shippingAddress?.mobile || "",
    companyName:
      order.companyName ||
      order.billingAddress?.companyName ||
      order.shippingAddress?.companyName ||
      "",
    itemCount: ensureArray(order.items).reduce(
      (sum, item) => sum + Number(item.qty || 0),
      0
    ),
    productSubtotal: Number(order.productSubtotal || 0),
    discountAmount: Number(order.discountAmount || 0),
    taxableValue: Number(order.taxableValue || 0),
    gstTotal: Number(order.gstTotal || 0),
    shippingCharge: Number(order.shippingCharge || 0),
    grandTotal: Number(order.grandTotal || 0),
    paymentStatus: order.paymentStatus || "pending",
    orderStatus: order.orderStatus || WALKIN_ORDER_STATUSES.WALKIN_ORDER_CREATED,
    paymentMethod: order.paymentMethod || "",
    shippingMethod: order.shippingMethod || "",
    invoiceId: order.invoiceId || null,
    invoiceNumber: order.invoiceNumber || "",
    shipmentStatus: order.shipmentStatus || "pending_packing",
    orderNote: order.orderNote || "",
    paymentReference: order.gatewayTxnId || "",
    createdAt: order.createdAt || null,
    updatedAt: order.updatedAt || null
  };
}

module.exports = {
  CUSTOMER_TYPES,
  WALKIN_PRICE_MODES,
  WALKIN_PAYMENT_METHODS,
  WALKIN_ORDER_STATUSES,
  WALKIN_ALLOWED_SHIPPING_METHODS,
  roundMoney,
  ensureArray,
  sanitizeWalkInCustomer,
  sanitizeWalkInProduct,
  sanitizeWalkInOrderSummary
};
