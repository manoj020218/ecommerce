const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./shipping.service");
const {
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
} = require("./shipping.validator");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    return new HttpError(400, "Validation failed.", { issues: error.issues });
  }
  return error;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(mapValidationError(error));
    }
  };
}

const adminGetShippingSettings = asyncHandler(async (_req, res) => {
  const data = await service.getShippingSettings();
  return ok(res, data, "Shipping settings fetched.");
});

const adminPatchShippingSettings = asyncHandler(async (req, res) => {
  const patch = parseShippingSettingsPatch(req.body);
  const data = await service.patchShippingSettings(patch, req.actor);
  return ok(res, data, "Shipping settings updated.");
});

const adminListRateCards = asyncHandler(async (req, res) => {
  const filters = parseListRateCardsQuery(req.query || {});
  const data = await service.listRateCards(filters);
  return ok(res, data, "Shipping rate cards fetched.");
});

const adminCreateRateCard = asyncHandler(async (req, res) => {
  const payload = parseCreateRateCardPayload(req.body);
  const data = await service.createRateCard(payload, req.actor);
  return created(res, data, "Shipping rate card created.");
});

const adminUpdateRateCard = asyncHandler(async (req, res) => {
  const patch = parseUpdateRateCardPayload(req.body);
  const data = await service.updateRateCard(req.params.rateCardId, patch, req.actor);
  return ok(res, data, "Shipping rate card updated.");
});

const adminListCouriers = asyncHandler(async (req, res) => {
  const filters = parseListCouriersQuery(req.query || {});
  const data = await service.listCourierProfiles(filters);
  return ok(res, data, "Courier profiles fetched.");
});

const adminCreateCourier = asyncHandler(async (req, res) => {
  const payload = parseCreateCourierProfilePayload(req.body);
  const data = await service.createCourierProfile(payload, req.actor);
  return created(res, data, "Courier profile created.");
});

const adminUpdateCourier = asyncHandler(async (req, res) => {
  const patch = parseUpdateCourierProfilePayload(req.body);
  const data = await service.updateCourierProfile(
    req.params.courierProfileId,
    patch,
    req.actor
  );
  return ok(res, data, "Courier profile updated.");
});

const adminListShippingQueue = asyncHandler(async (req, res) => {
  const filters = parseListShippingQueueQuery(req.query || {});
  const data = await service.listShippingQueue(filters);
  return ok(res, data, "Shipping queue fetched.");
});

const adminCreateShipment = asyncHandler(async (req, res) => {
  const payload = parseCreateShipmentPayload(req.body);
  const data = await service.createShipment(payload, req.actor);
  return created(res, data, "Shipment created.");
});

const adminGetShipment = asyncHandler(async (req, res) => {
  const data = await service.getShipment(req.params.shipmentId);
  return ok(res, data, "Shipment fetched.");
});

const adminUpdateShipmentTracking = asyncHandler(async (req, res) => {
  const payload = parseUpdateShipmentTrackingPayload(req.body);
  const data = await service.updateShipmentTracking(req.params.shipmentId, payload, req.actor);
  return ok(res, data, "Shipment tracking updated.");
});

const adminUpdateShipmentStatus = asyncHandler(async (req, res) => {
  const payload = parseUpdateShipmentStatusPayload(req.body);
  const data = await service.updateShipmentStatus(req.params.shipmentId, payload, req.actor);
  return ok(res, data, "Shipment status updated.");
});

const adminSendTrackingEmail = asyncHandler(async (req, res) => {
  const payload = parseSendTrackingEmailPayload(req.body);
  const data = await service.sendTrackingEmail(req.params.shipmentId, payload, req.actor);
  return ok(res, data, "Tracking email sent.");
});

const adminUploadShipmentPod = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.path) {
    throw new HttpError(400, "POD file upload is required with field name `file`.");
  }

  const data = await service.uploadShipmentPod(req.params.shipmentId, req.file.path, req.actor);
  return created(res, data, "POD uploaded.");
});

const adminListShippingClasses = asyncHandler(async (_req, res) => {
  const data = await service.listShippingClasses();
  return ok(res, data, "Shipping classes fetched.");
});

const adminCreateShippingClass = asyncHandler(async (req, res) => {
  const data = await service.createShippingClass(req.body, req.actor);
  return created(res, data, "Shipping class created.");
});

const adminUpdateShippingClass = asyncHandler(async (req, res) => {
  const data = await service.updateShippingClass(req.params.classId, req.body, req.actor);
  return ok(res, data, "Shipping class updated.");
});

const publicEstimateCartShipping = asyncHandler(async (req, res) => {
  const query = parseEstimateCartShippingQuery(req.query || {});
  const data = await service.estimateCartShipping(query);
  return ok(res, data, "Cart shipping estimate calculated.");
});

const publicTrackShipment = asyncHandler(async (req, res) => {
  const data = await service.trackShipmentByTrackingId(req.params.trackingId);
  return ok(res, data, "Tracking details fetched.");
});

module.exports = {
  adminGetShippingSettings,
  adminPatchShippingSettings,
  adminListRateCards,
  adminCreateRateCard,
  adminUpdateRateCard,
  adminListCouriers,
  adminCreateCourier,
  adminUpdateCourier,
  adminListShippingQueue,
  adminCreateShipment,
  adminGetShipment,
  adminUpdateShipmentTracking,
  adminUpdateShipmentStatus,
  adminSendTrackingEmail,
  adminUploadShipmentPod,
  publicEstimateCartShipping,
  publicTrackShipment,
  adminListShippingClasses,
  adminCreateShippingClass,
  adminUpdateShippingClass
};
