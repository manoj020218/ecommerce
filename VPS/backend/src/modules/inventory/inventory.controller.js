const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./inventory.service");
const {
  parseAdjustInventoryPayload,
  parseUpdateInventoryPolicyPayload,
  parseListMovementsQuery,
  parseLowStockQuery
} = require("./inventory.validator");

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

const adminGetProductInventory = asyncHandler(async (req, res) => {
  const data = await service.getInventoryByProductId(req.params.productId);
  return ok(res, data, "Inventory fetched.");
});

const adminAdjustInventory = asyncHandler(async (req, res) => {
  const payload = parseAdjustInventoryPayload(req.body);
  const data = await service.adjustInventory(req.params.productId, payload, req.actor);
  return ok(res, data, "Inventory adjusted.");
});

const adminUpdateInventoryPolicy = asyncHandler(async (req, res) => {
  const patch = parseUpdateInventoryPolicyPayload(req.body);
  const data = await service.updateInventoryPolicy(
    req.params.productId,
    patch,
    req.actor
  );
  return ok(res, data, "Inventory policy updated.");
});

const adminListInventoryMovements = asyncHandler(async (req, res) => {
  const filters = parseListMovementsQuery(req.query || {});
  const data = await service.listInventoryMovements(filters);
  return ok(res, data, "Inventory movements fetched.");
});

const adminListLowStockAlerts = asyncHandler(async (req, res) => {
  const filters = parseLowStockQuery(req.query || {});
  const data = await service.listLowStockAlerts(filters);
  return ok(res, data, "Low stock alerts fetched.");
});

module.exports = {
  adminGetProductInventory,
  adminAdjustInventory,
  adminUpdateInventoryPolicy,
  adminListInventoryMovements,
  adminListLowStockAlerts
};
