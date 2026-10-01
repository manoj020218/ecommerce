// Buyer messages for walk-in order stages (2026-10-02): payment confirmed,
// packed, shipped (without courier tracking), ready for pickup, picked up /
// delivered. Each event goes by email + WhatsApp via the editable templates
// in Marketing → Templates. Shipped WITH courier tracking is sent by the
// shipping module (tracking_detail_update), not from here.
// Best-effort: a failed message never blocks the status change.

const { getAllSettings } = require("../settings/settings.service");
const { notifyCustomerEvent } = require("../marketing/marketing.service");

function formatInr(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function contactOf(order) {
  const billing = order?.billingAddress || {};
  const shipping = order?.shippingAddress || {};
  return {
    name: billing.companyName || billing.name || shipping.companyName || shipping.name || "Customer",
    email: String(shipping.email || billing.email || "").trim().toLowerCase(),
    mobile: String(shipping.mobile || billing.mobile || "").trim()
  };
}

async function pickupDetails() {
  const settings = await getAllSettings();
  const profile = settings.storeProfile || {};
  const contact = settings.contactInformation || {};
  return {
    pickupLocation: profile.pickupAddress || contact.publicAddress || profile.address || "",
    pickupTimings: contact.supportTiming || profile.businessHours || "",
    mapLink: contact.googleMapLink || ""
  };
}

const EVENT_KEYS = Object.freeze({
  paymentConfirmed: "walkin_payment_confirmed",
  packed: "order_packed",
  dispatched: "order_dispatched",
  readyForPickup: "ready_for_pickup",
  pickedUp: "self_pickup_completed",
  delivered: "order_delivered"
});

async function notifyWalkInEvent(order, event, extra = {}) {
  const eventKey = EVENT_KEYS[event];
  if (!order || !eventKey) return null;
  try {
    const contact = contactOf(order);
    if (!contact.email && !contact.mobile) return null;
    const isSelfPickup = order.shippingMethod === "self_pickup";
    const pickup = event === "readyForPickup" || event === "paymentConfirmed" ? await pickupDetails() : {};
    const variables = {
      customerName: contact.name,
      orderNo: order.orderNo || "",
      orderTotal: formatInr(order.grandTotal),
      invoiceNo: order.invoiceNumber || "",
      nextStep: isSelfPickup
        ? "We'll message you as soon as your order is ready for pickup."
        : "We'll send you the courier and tracking details as soon as it ships.",
      pickupInstructions: extra.note || "",
      ...pickup,
      ...extra.variables
    };
    return await notifyCustomerEvent({
      eventKey,
      toEmail: contact.email,
      toMobile: contact.mobile,
      relatedResourceType: "order",
      relatedResourceId: order.id,
      variables
    });
  } catch (_error) {
    return null;
  }
}

module.exports = { notifyWalkInEvent };
