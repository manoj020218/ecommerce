const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./payment-gateways.service");
const {
  parseListGatewaysQuery,
  parseUpdateGatewayPayload,
  parseUpdateDirectDiscountPayload
} = require("./payment-gateways.validator");

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

const adminListPaymentGateways = asyncHandler(async (req, res) => {
  const filters = parseListGatewaysQuery(req.query || {});
  const data = await service.listPaymentGateways(filters);
  return ok(res, data, "Payment gateways fetched.");
});

const adminUpdatePaymentGateway = asyncHandler(async (req, res) => {
  const patch = parseUpdateGatewayPayload(req.body);
  const data = await service.updatePaymentGateway(req.params.gatewayCode, patch, req.actor);
  return ok(res, data, "Payment gateway updated.");
});

const adminUpdateDirectDiscount = asyncHandler(async (req, res) => {
  const patch = parseUpdateDirectDiscountPayload(req.body);
  const data = await service.updateDirectPaymentDiscountConfig(patch, req.actor);
  return ok(res, data, "Direct payment discount updated.");
});

module.exports = {
  adminListPaymentGateways,
  adminUpdatePaymentGateway,
  adminUpdateDirectDiscount
};
