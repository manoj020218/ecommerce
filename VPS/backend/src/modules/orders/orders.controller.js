const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./orders.service");
const {
  parseListOrdersQuery,
  parseUpdateOrderPayload,
  parseEditOrderItemsPayload
} = require("./orders.validator");

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

const adminListOrders = asyncHandler(async (req, res) => {
  const filters = parseListOrdersQuery(req.query || {});
  const data = await service.listOrders(filters);
  return ok(res, data, "Orders fetched.");
});

const adminGetOrderDetail = asyncHandler(async (req, res) => {
  const data = await service.getOrderDetail(req.params.orderId);
  return ok(res, data, "Order detail fetched.");
});

const adminUpdateOrder = asyncHandler(async (req, res) => {
  const patch = parseUpdateOrderPayload(req.body || {});
  const data = await service.updateOrder(req.params.orderId, patch, req.actor);
  return ok(res, data, "Order updated.");
});

const adminEditOrderItems = asyncHandler(async (req, res) => {
  const patch = parseEditOrderItemsPayload(req.body || {});
  const data = await service.editOrderItems(req.params.orderId, patch, req.actor);
  return ok(res, data, "Order items updated.");
});

const adminExportOrders = asyncHandler(async (req, res) => {
  const filters = parseListOrdersQuery(req.query || {});
  const csv = await service.exportOrdersCsv(filters);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="orders-${Date.now()}.csv"`);
  res.send(csv);
});

const adminListStuckPaymentSessions = asyncHandler(async (req, res) => {
  const data = await service.listStuckPaymentSessions();
  return ok(res, data, "Stuck payment sessions fetched.");
});

module.exports = {
  adminListOrders,
  adminGetOrderDetail,
  adminUpdateOrder,
  adminEditOrderItems,
  adminExportOrders,
  adminListStuckPaymentSessions
};
