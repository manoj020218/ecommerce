const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const {
  SHIPPING_METHODS,
  SHIPPING_ZONES,
  SHIPMENT_STATUSES,
  SHIPPING_API_PROVIDERS
} = require("./shipping.model");

const shippingMethodSchema = z.enum([
  SHIPPING_METHODS.STANDARD,
  SHIPPING_METHODS.EXPRESS,
  SHIPPING_METHODS.LOCAL_PICKUP,
  SHIPPING_METHODS.SELF_PICKUP,
  SHIPPING_METHODS.TRANSPORT,
  SHIPPING_METHODS.MANUAL_DELIVERY
]);

const shippingZoneSchema = z.enum([
  SHIPPING_ZONES.LOCAL,
  SHIPPING_ZONES.STATE,
  SHIPPING_ZONES.NORTH_INDIA,
  SHIPPING_ZONES.WEST_INDIA,
  SHIPPING_ZONES.SOUTH_INDIA,
  SHIPPING_ZONES.NORTH_EAST_REMOTE,
  SHIPPING_ZONES.ALL_INDIA
]);

const shipmentStatusSchema = z.enum([
  SHIPMENT_STATUSES.PENDING_PACKING,
  SHIPMENT_STATUSES.PACKED,
  SHIPMENT_STATUSES.READY_TO_DISPATCH,
  SHIPMENT_STATUSES.SHIPPED,
  SHIPMENT_STATUSES.IN_TRANSIT,
  SHIPMENT_STATUSES.OUT_FOR_DELIVERY,
  SHIPMENT_STATUSES.DELIVERED,
  SHIPMENT_STATUSES.DELIVERY_FAILED,
  SHIPMENT_STATUSES.RETURNED,
  SHIPMENT_STATUSES.CANCELLED,
  SHIPMENT_STATUSES.READY_FOR_PICKUP,
  SHIPMENT_STATUSES.PICKED_UP
]);

const shippingSettingsPatchSchema = z.object({
  originStateCode: z.string().trim().max(10).optional(),
  localPincodePrefixes: z.array(z.string().trim().max(10)).optional(),
  remotePincodePrefixes: z.array(z.string().trim().max(10)).optional(),
  remoteExtraChargeByMethod: z
    .record(z.coerce.number().min(0).max(100000))
    .optional(),
  zoneStateMap: z
    .object({
      north_india: z.array(z.string().trim().max(10)).optional(),
      west_india: z.array(z.string().trim().max(10)).optional(),
      south_india: z.array(z.string().trim().max(10)).optional(),
      north_east_remote: z.array(z.string().trim().max(10)).optional()
    })
    .optional()
});

const listRateCardsQuerySchema = z.object({
  shippingMethod: shippingMethodSchema.optional(),
  zone: shippingZoneSchema.optional(),
  includeInactive: z.coerce.boolean().optional().default(true)
});

const createRateCardSchema = z.object({
  shippingMethod: shippingMethodSchema,
  zone: shippingZoneSchema,
  baseCharge: z.coerce.number().min(0).max(100000),
  perKgCharge: z.coerce.number().min(0).max(100000),
  isActive: z.boolean().optional().default(true)
});

const updateRateCardSchema = z.object({
  baseCharge: z.coerce.number().min(0).max(100000).optional(),
  perKgCharge: z.coerce.number().min(0).max(100000).optional(),
  isActive: z.boolean().optional()
});

const listCouriersQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional().default(true)
});

const createCourierProfileSchema = z.object({
  courierName: z.string().trim().min(2).max(140),
  courierCode: z.string().trim().min(2).max(40),
  trackingUrlTemplate: z.string().trim().min(4).max(500),
  trackingPageUrl: z.string().trim().max(500).optional().default(""),
  supportPhone: z.string().trim().max(40).optional().default(""),
  supportEmail: z.string().trim().max(200).optional().default(""),
  apiEnabled: z.boolean().optional().default(false),
  apiProvider: z
    .enum([
      SHIPPING_API_PROVIDERS.MANUAL_COURIER,
      SHIPPING_API_PROVIDERS.SHIPROCKET,
      SHIPPING_API_PROVIDERS.DELHIVERY,
      SHIPPING_API_PROVIDERS.DTDC,
      SHIPPING_API_PROVIDERS.BLUEDART
    ])
    .optional()
    .default(SHIPPING_API_PROVIDERS.MANUAL_COURIER),
  isActive: z.boolean().optional().default(true)
});

const updateCourierProfileSchema = z.object({
  courierName: z.string().trim().min(2).max(140).optional(),
  trackingUrlTemplate: z.string().trim().min(4).max(500).optional(),
  trackingPageUrl: z.string().trim().max(500).optional(),
  supportPhone: z.string().trim().max(40).optional(),
  supportEmail: z.string().trim().max(200).optional(),
  apiEnabled: z.boolean().optional(),
  apiProvider: z
    .enum([
      SHIPPING_API_PROVIDERS.MANUAL_COURIER,
      SHIPPING_API_PROVIDERS.SHIPROCKET,
      SHIPPING_API_PROVIDERS.DELHIVERY,
      SHIPPING_API_PROVIDERS.DTDC,
      SHIPPING_API_PROVIDERS.BLUEDART
    ])
    .optional(),
  isActive: z.boolean().optional()
});

const listShippingQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  shipmentStatus: shipmentStatusSchema.optional()
});

const createShipmentSchema = z.object({
  orderId: z.string().trim().min(2).max(150),
  courierProfileId: z.string().trim().max(150).optional().nullable().default(null),
  packageCount: z.coerce.number().int().min(1).max(500).optional().default(1),
  adminNotes: z.string().trim().max(1000).optional().default("")
});

const updateShipmentTrackingSchema = z.object({
  courierProfileId: z.string().trim().min(2).max(150),
  trackingId: z.string().trim().min(2).max(180),
  dispatchDate: z.string().trim().max(40).optional().default(""),
  expectedDeliveryDate: z.string().trim().max(40).optional().default(""),
  // Lets the caller stop at an intermediate stage (packed / waiting for pickup)
  // instead of always jumping straight to shipped the moment tracking is entered.
  targetStatus: z
    .enum([SHIPMENT_STATUSES.PACKED, SHIPMENT_STATUSES.READY_TO_DISPATCH, SHIPMENT_STATUSES.SHIPPED])
    .optional()
    .default(SHIPMENT_STATUSES.SHIPPED)
});

const updateShipmentStatusSchema = z.object({
  shipmentStatus: shipmentStatusSchema,
  adminNotes: z.string().trim().max(1000).optional().default(""),
  deliveredAt: z.string().trim().max(40).optional().default("")
});

const sendTrackingEmailSchema = z.object({
  toEmail: z
    .union([z.string().trim().email().max(200), z.literal("")])
    .optional()
    .default(""),
  ccEmail: z
    .union([z.string().trim().email().max(200), z.literal("")])
    .optional()
    .default("")
});

const estimateCartShippingQuerySchema = z.object({
  sessionId: z.string().trim().max(120).optional(),
  shippingMethod: shippingMethodSchema.optional().default(SHIPPING_METHODS.STANDARD),
  pincode: z.string().trim().max(10).optional().default(""),
  stateCode: z.string().trim().max(10).optional().default(""),
  state: z.string().trim().max(80).optional().default("")
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseShippingSettingsPatch(payload) {
  ensureObject(payload, "Shipping settings");
  return shippingSettingsPatchSchema.parse(payload);
}

function parseListRateCardsQuery(query) {
  return listRateCardsQuerySchema.parse(query || {});
}

function parseCreateRateCardPayload(payload) {
  ensureObject(payload, "Create rate card");
  return createRateCardSchema.parse(payload);
}

function parseUpdateRateCardPayload(payload) {
  ensureObject(payload, "Update rate card");
  return updateRateCardSchema.parse(payload);
}

function parseListCouriersQuery(query) {
  return listCouriersQuerySchema.parse(query || {});
}

function parseCreateCourierProfilePayload(payload) {
  ensureObject(payload, "Create courier profile");
  return createCourierProfileSchema.parse(payload);
}

function parseUpdateCourierProfilePayload(payload) {
  ensureObject(payload, "Update courier profile");
  return updateCourierProfileSchema.parse(payload);
}

function parseListShippingQueueQuery(query) {
  return listShippingQueueQuerySchema.parse(query || {});
}

function parseCreateShipmentPayload(payload) {
  ensureObject(payload, "Create shipment");
  return createShipmentSchema.parse(payload);
}

function parseUpdateShipmentTrackingPayload(payload) {
  ensureObject(payload, "Update shipment tracking");
  return updateShipmentTrackingSchema.parse(payload);
}

function parseUpdateShipmentStatusPayload(payload) {
  ensureObject(payload, "Update shipment status");
  return updateShipmentStatusSchema.parse(payload);
}

function parseSendTrackingEmailPayload(payload) {
  ensureObject(payload, "Send tracking email");
  return sendTrackingEmailSchema.parse(payload);
}

function parseEstimateCartShippingQuery(query) {
  return estimateCartShippingQuerySchema.parse(query || {});
}

module.exports = {
  parseShippingSettingsPatch,
  parseListRateCardsQuery,
  parseCreateRateCardPayload,
  parseUpdateRateCardPayload,
  parseListCouriersQuery,
  parseCreateCourierProfilePayload,
  parseUpdateCourierProfilePayload,
  parseListShippingQueueQuery,
  parseCreateShipmentPayload,
  parseUpdateShipmentTrackingPayload,
  parseUpdateShipmentStatusPayload,
  parseSendTrackingEmailPayload,
  parseEstimateCartShippingQuery
};
