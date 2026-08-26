const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./walkin-orders.service");
const {
  parseListWalkInOrdersQuery,
  parseSearchCustomersQuery,
  parseSearchProductsQuery,
  parseCreateWalkInOrderPayload,
  parseUpdateWalkInOrderPayload,
  parseConfirmPaymentPayload,
  parseGenerateInvoicePayload,
  parseUpdateWalkInOrderStatusPayload,
  parseSaveCustomerPayload
} = require("./walkin-orders.validator");

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

const adminListWalkInOrders = asyncHandler(async (req, res) => {
  const filters = parseListWalkInOrdersQuery(req.query || {});
  const data = await service.listWalkInOrders(filters);
  return ok(res, data, "Walk-in orders fetched.");
});

const adminSearchWalkInCustomers = asyncHandler(async (req, res) => {
  const filters = parseSearchCustomersQuery(req.query || {});
  const data = await service.searchWalkInCustomers(filters);
  return ok(res, data, "Walk-in customers fetched.");
});

const adminSearchWalkInProducts = asyncHandler(async (req, res) => {
  const filters = parseSearchProductsQuery(req.query || {});
  const data = await service.searchWalkInProducts(filters);
  return ok(res, data, "Walk-in products fetched.");
});

const adminListWalkInCategories = asyncHandler(async (_req, res) => {
  const data = await service.listWalkInCategories();
  return ok(res, data, "Walk-in categories fetched.");
});

const adminCreateWalkInOrder = asyncHandler(async (req, res) => {
  const payload = parseCreateWalkInOrderPayload(req.body);
  const data = await service.createWalkInOrder(payload, req.actor);
  return created(res, data, "Walk-in order created.");
});

const adminUpdateWalkInOrder = asyncHandler(async (req, res) => {
  const payload = parseUpdateWalkInOrderPayload(req.body);
  const data = await service.updateWalkInOrder(req.params.orderId, payload, req.actor);
  return ok(res, data, "Walk-in order updated.");
});

const adminConfirmWalkInPayment = asyncHandler(async (req, res) => {
  const payload = parseConfirmPaymentPayload(req.body);
  const data = await service.confirmWalkInPayment(req.params.orderId, payload, req.actor);
  return ok(res, data, "Walk-in payment confirmed.");
});

const adminGenerateWalkInInvoice = asyncHandler(async (req, res) => {
  const payload = parseGenerateInvoicePayload(req.body || {});
  const data = await service.generateWalkInInvoice(req.params.orderId, payload, req.actor);
  return ok(res, data, "Walk-in invoice generated.");
});

const adminUpdateWalkInOrderStatus = asyncHandler(async (req, res) => {
  const payload = parseUpdateWalkInOrderStatusPayload(req.body);
  const data = await service.updateWalkInOrderStatus(
    req.params.orderId,
    payload,
    req.actor
  );
  return ok(res, data, "Walk-in order updated.");
});

const adminSaveWalkInCustomer = asyncHandler(async (req, res) => {
  const payload = parseSaveCustomerPayload(req.body);
  const data = await service.saveWalkInCustomer(payload, req.actor);
  return created(res, data, "Customer saved.");
});

const adminSendWalkInPaymentRequest = asyncHandler(async (req, res) => {
  const data = await service.sendWalkInPaymentRequest(req.params.orderId, req.actor);
  return ok(res, data, "Payment request sent.");
});

const adminPreviewWalkInInvoice = asyncHandler(async (req, res) => {
  const data = await service.previewWalkInInvoice(req.params.orderId, req.actor);
  return ok(res, data, "Invoice preview generated.");
});

module.exports = {
  adminListWalkInOrders,
  adminSearchWalkInCustomers,
  adminSearchWalkInProducts,
  adminListWalkInCategories,
  adminCreateWalkInOrder,
  adminUpdateWalkInOrder,
  adminConfirmWalkInPayment,
  adminGenerateWalkInInvoice,
  adminUpdateWalkInOrderStatus,
  adminSaveWalkInCustomer,
  adminSendWalkInPaymentRequest,
  adminPreviewWalkInInvoice
};
