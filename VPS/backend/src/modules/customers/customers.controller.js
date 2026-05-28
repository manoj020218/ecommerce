const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./customers.service");
const {
  parseListCustomersQuery,
  parseUpdateCustomerPayload,
  parseListOrderRequestsQuery,
  parseApproveOrderRequestPayload,
  parseUpdateB2BOrderStatusPayload
} = require("./customers.validator");

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

const adminListCustomers = asyncHandler(async (req, res) => {
  const filters = parseListCustomersQuery(req.query || {});
  const data = await service.listCustomers(filters);
  return ok(res, data, "Customers fetched.");
});

const adminUpdateCustomer = asyncHandler(async (req, res) => {
  const payload = parseUpdateCustomerPayload(req.body);
  const data = await service.updateCustomer(req.params.customerId, payload, req.actor);
  return ok(res, data, "Customer updated.");
});

const adminListOrderRequests = asyncHandler(async (req, res) => {
  const filters = parseListOrderRequestsQuery(req.query || {});
  const data = await service.listOrderRequests(filters);
  return ok(res, data, "B2B order requests fetched.");
});

const adminApproveOrderRequest = asyncHandler(async (req, res) => {
  const payload = parseApproveOrderRequestPayload(req.body || {});
  const data = await service.approveOrderRequest(req.params.orderId, payload, req.actor);
  return ok(res, data, "B2B order request approved.");
});

const adminUpdateB2BOrderStatus = asyncHandler(async (req, res) => {
  const payload = parseUpdateB2BOrderStatusPayload(req.body);
  const data = await service.updateB2BOrderStatus(req.params.orderId, payload, req.actor);
  return ok(res, data, "B2B order status updated.");
});

module.exports = {
  adminListCustomers,
  adminUpdateCustomer,
  adminListOrderRequests,
  adminApproveOrderRequest,
  adminUpdateB2BOrderStatus
};
