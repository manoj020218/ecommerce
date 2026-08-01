const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./customers.service");
const { getCustomerCartForAdmin } = require("../cart-checkout/cart-checkout.service");
const {
  listCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress
} = require("../customer-account/customer-account.service");
const {
  parseListCustomersQuery,
  parseCreateCustomerPayload,
  parseUpdateCustomerPayload,
  parseListOrderRequestsQuery,
  parseApproveOrderRequestPayload,
  parseUpdateB2BOrderStatusPayload
} = require("./customers.validator");
const {
  parseCreateAddressPayload,
  parseUpdateAddressPayload
} = require("../customer-account/customer-account.validator");

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

const adminCreateCustomer = asyncHandler(async (req, res) => {
  const payload = parseCreateCustomerPayload(req.body);
  const data = await service.createCustomer(payload, req.actor);
  return created(res, data, "Customer created.");
});

const adminGetCustomer = asyncHandler(async (req, res) => {
  const data = await service.getCustomer(req.params.customerId);
  return ok(res, data, "Customer fetched.");
});

const adminGetCustomerOrders = asyncHandler(async (req, res) => {
  const data = await service.listCustomerOrders(req.params.customerId);
  return ok(res, data, "Customer orders fetched.");
});

const adminGetCustomerCart = asyncHandler(async (req, res) => {
  const data = await getCustomerCartForAdmin(req.params.customerId);
  return ok(res, data, "Customer cart fetched.");
});

const adminListCustomerAddresses = asyncHandler(async (req, res) => {
  const data = await listCustomerAddresses(req.params.customerId);
  return ok(res, data, "Customer addresses fetched.");
});

const adminCreateCustomerAddress = asyncHandler(async (req, res) => {
  const payload = parseCreateAddressPayload(req.body);
  const data = await createCustomerAddress(req.params.customerId, payload);
  return created(res, data, "Address added.");
});

const adminUpdateCustomerAddress = asyncHandler(async (req, res) => {
  const payload = parseUpdateAddressPayload(req.body);
  const data = await updateCustomerAddress(
    req.params.customerId,
    req.params.addressId,
    payload
  );
  return ok(res, data, "Address updated.");
});

const adminDeleteCustomerAddress = asyncHandler(async (req, res) => {
  const data = await deleteCustomerAddress(req.params.customerId, req.params.addressId);
  return ok(res, data, "Address removed.");
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
  adminCreateCustomer,
  adminGetCustomer,
  adminGetCustomerOrders,
  adminGetCustomerCart,
  adminListCustomerAddresses,
  adminCreateCustomerAddress,
  adminUpdateCustomerAddress,
  adminDeleteCustomerAddress,
  adminUpdateCustomer,
  adminListOrderRequests,
  adminApproveOrderRequest,
  adminUpdateB2BOrderStatus
};
