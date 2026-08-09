const SHIPPING_METHODS = Object.freeze({
  STANDARD: "standard",
  EXPRESS: "express",
  LOCAL_PICKUP: "local_pickup",
  SELF_PICKUP: "self_pickup",
  TRANSPORT: "transport",
  MANUAL_DELIVERY: "manual_delivery"
});

const SHIPPING_ZONES = Object.freeze({
  LOCAL: "local",
  STATE: "state",
  NORTH_INDIA: "north_india",
  WEST_INDIA: "west_india",
  SOUTH_INDIA: "south_india",
  NORTH_EAST_REMOTE: "north_east_remote",
  ALL_INDIA: "all_india"
});

const SHIPPING_ZONE_LABELS = Object.freeze({
  [SHIPPING_ZONES.LOCAL]: "Local",
  [SHIPPING_ZONES.STATE]: "State",
  [SHIPPING_ZONES.NORTH_INDIA]: "North India",
  [SHIPPING_ZONES.WEST_INDIA]: "West India",
  [SHIPPING_ZONES.SOUTH_INDIA]: "South India",
  [SHIPPING_ZONES.NORTH_EAST_REMOTE]: "North East / Remote",
  [SHIPPING_ZONES.ALL_INDIA]: "All India"
});

const SHIPMENT_STATUSES = Object.freeze({
  PENDING_PACKING: "pending_packing",
  PACKED: "packed",
  READY_TO_DISPATCH: "ready_to_dispatch",
  SHIPPED: "shipped",
  IN_TRANSIT: "in_transit",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  DELIVERY_FAILED: "delivery_failed",
  RETURNED: "returned",
  CANCELLED: "cancelled",
  READY_FOR_PICKUP: "ready_for_pickup",
  PICKED_UP: "picked_up"
});

const SHIPPING_API_PROVIDERS = Object.freeze({
  MANUAL_COURIER: "manual_courier",
  SHIPROCKET: "shiprocket_future",
  DELHIVERY: "delhivery_future",
  DTDC: "dtdc_future",
  BLUEDART: "bluedart_future"
});

function sanitizeRateCard(rateCard) {
  return {
    id: rateCard.id,
    shippingMethod: rateCard.shippingMethod,
    zone: rateCard.zone,
    baseCharge: Number(rateCard.baseCharge || 0),
    perKgCharge: Number(rateCard.perKgCharge || 0),
    isActive: Boolean(rateCard.isActive),
    updatedAt: rateCard.updatedAt || null
  };
}

function sanitizeCourierProfile(profile) {
  return {
    id: profile.id,
    courierName: profile.courierName,
    courierCode: profile.courierCode,
    trackingUrlTemplate: profile.trackingUrlTemplate,
    trackingPageUrl: profile.trackingPageUrl || "",
    supportPhone: profile.supportPhone || "",
    supportEmail: profile.supportEmail || "",
    apiEnabled: Boolean(profile.apiEnabled),
    apiProvider: profile.apiProvider || SHIPPING_API_PROVIDERS.MANUAL_COURIER,
    isActive: Boolean(profile.isActive),
    linkedIntegrationCourierId: profile.linkedIntegrationCourierId || null,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

function sanitizeShipment(shipment) {
  return {
    id: shipment.id,
    orderId: shipment.orderId,
    orderNo: shipment.orderNo,
    shipmentStatus: shipment.shipmentStatus,
    courierProfileId: shipment.courierProfileId || null,
    courierCode: shipment.courierCode || "",
    courierName: shipment.courierName || "",
    trackingId: shipment.trackingId || "",
    trackingUrl: shipment.trackingUrl || "",
    dispatchDate: shipment.dispatchDate || "",
    expectedDeliveryDate: shipment.expectedDeliveryDate || "",
    packageWeightKg: Number(shipment.packageWeightKg || 0),
    packageCount: Number(shipment.packageCount || 1),
    podStatus: shipment.podStatus || "pending",
    podFileUrl: shipment.podFileUrl || "",
    deliveredAt: shipment.deliveredAt || "",
    adminNotes: shipment.adminNotes || "",
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt
  };
}

module.exports = {
  SHIPPING_METHODS,
  SHIPPING_ZONES,
  SHIPPING_ZONE_LABELS,
  SHIPMENT_STATUSES,
  SHIPPING_API_PROVIDERS,
  sanitizeRateCard,
  sanitizeCourierProfile,
  sanitizeShipment
};
