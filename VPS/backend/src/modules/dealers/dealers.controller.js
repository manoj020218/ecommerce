const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./dealers.service");
const { parseRegisterDealer, parseUpdateDealer } = require("./dealers.validator");
const { BUSINESS_TYPES } = require("./dealers.model");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    const first = error.issues?.[0];
    return new HttpError(400, first?.message || "Validation failed.", { issues: error.issues });
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

// public
const publicFormOptions = asyncHandler(async (_req, res) => ok(res, { businessTypes: BUSINESS_TYPES }, "Dealer form options."));
const publicRegister = asyncHandler(async (req, res) => {
  const data = await service.registerDealer(parseRegisterDealer(req.body));
  return created(res, data, data.alreadyRegistered ? "You are already registered with us." : "Registration successful.");
});

// admin
const adminListDealers = asyncHandler(async (req, res) =>
  ok(res, await service.listDealers({ q: req.query.q || "", status: req.query.status || "", stateCode: req.query.stateCode || "" }), "Dealers fetched."));
const adminGetDealer = asyncHandler(async (req, res) => ok(res, await service.getDealer(req.params.customerId), "Dealer fetched."));
const adminUpdateDealer = asyncHandler(async (req, res) =>
  ok(res, await service.updateDealer(req.params.customerId, parseUpdateDealer(req.body), req.actor), "Dealer updated."));

module.exports = { publicFormOptions, publicRegister, adminListDealers, adminGetDealer, adminUpdateDealer };
