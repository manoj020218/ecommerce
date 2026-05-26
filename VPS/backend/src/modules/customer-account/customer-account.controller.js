const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./customer-account.service");
const {
  parseAccountBootstrapQuery,
  parseListOrdersQuery,
  parseUpdateProfilePayload,
  parseLinkGuestOrderPayload,
  parseReorderOrderPayload,
  parseCreateAddressPayload,
  parseUpdateAddressPayload,
  parseGstDetailsPayload
} = require("./customer-account.validator");

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

const getBootstrap = asyncHandler(async (req, res) => {
  const query = parseAccountBootstrapQuery(req.query || {});
  const data = await service.getCustomerAccountBootstrap(req.customer.id, query);
  return ok(res, data, "Customer account bootstrap fetched.");
});

const updateProfile = asyncHandler(async (req, res) => {
  const payload = parseUpdateProfilePayload(req.body);
  const data = await service.updateCustomerProfile(req.customer.id, payload);
  return ok(res, data, "Customer profile updated.");
});

const listOrders = asyncHandler(async (req, res) => {
  const query = parseListOrdersQuery(req.query || {});
  const data = await service.listCustomerOrders(req.customer.id, query);
  return ok(res, data, "Customer orders fetched.");
});

const getOrderDetail = asyncHandler(async (req, res) => {
  const data = await service.getCustomerOrderDetail(req.customer.id, req.params.orderId);
  return ok(res, data, "Customer order fetched.");
});

const linkGuestOrder = asyncHandler(async (req, res) => {
  const payload = parseLinkGuestOrderPayload(req.body);
  const data = await service.linkGuestOrderToCustomer(req.customer.id, payload);
  return ok(res, data, "Guest order link processed.");
});

const reorderOrder = asyncHandler(async (req, res) => {
  const payload = parseReorderOrderPayload(req.body || {});
  const data = await service.reorderCustomerOrder(
    req.customer.id,
    req.params.orderId,
    payload
  );
  return ok(res, data, "Order reordered using current rules.");
});

const listInvoices = asyncHandler(async (req, res) => {
  const query = parseListOrdersQuery(req.query || {});
  const data = await service.listCustomerInvoices(req.customer.id, query);
  return ok(res, data, "Customer invoices fetched.");
});

const getInvoice = asyncHandler(async (req, res) => {
  const data = await service.getCustomerInvoice(req.customer.id, req.params.invoiceId);
  return ok(res, data, "Customer invoice fetched.");
});

const downloadInvoice = asyncHandler(async (req, res) => {
  const data = await service.downloadCustomerInvoice(req.customer.id, req.params.invoiceId);
  return ok(res, data, "Customer invoice download payload fetched.");
});

const listTracking = asyncHandler(async (req, res) => {
  const query = parseListOrdersQuery(req.query || {});
  const data = await service.listCustomerTracking(req.customer.id, query);
  return ok(res, data, "Customer tracking list fetched.");
});

const listAddresses = asyncHandler(async (req, res) => {
  const data = await service.listCustomerAddresses(req.customer.id);
  return ok(res, data, "Customer addresses fetched.");
});

const createAddress = asyncHandler(async (req, res) => {
  const payload = parseCreateAddressPayload(req.body);
  const data = await service.createCustomerAddress(req.customer.id, payload);
  return created(res, data, "Customer address saved.");
});

const updateAddress = asyncHandler(async (req, res) => {
  const payload = parseUpdateAddressPayload(req.body);
  const data = await service.updateCustomerAddress(
    req.customer.id,
    req.params.addressId,
    payload
  );
  return ok(res, data, "Customer address updated.");
});

const deleteAddress = asyncHandler(async (req, res) => {
  const data = await service.deleteCustomerAddress(req.customer.id, req.params.addressId);
  return ok(res, data, "Customer address deleted.");
});

const updateGstDetails = asyncHandler(async (req, res) => {
  const payload = parseGstDetailsPayload(req.body);
  const data = await service.updateCustomerGstDetails(req.customer.id, payload);
  return ok(res, data, "Customer GST details updated.");
});

const listSavedProducts = asyncHandler(async (req, res) => {
  const data = await service.listSavedProducts(req.customer.id);
  return ok(res, data, "Saved products fetched.");
});

const saveProduct = asyncHandler(async (req, res) => {
  const data = await service.saveProductForCustomer(req.customer.id, req.params.productId);
  return created(res, data, "Product saved.");
});

const removeSavedProduct = asyncHandler(async (req, res) => {
  const data = await service.removeSavedProductForCustomer(
    req.customer.id,
    req.params.productId
  );
  return ok(res, data, "Saved product removed.");
});

module.exports = {
  getBootstrap,
  updateProfile,
  listOrders,
  getOrderDetail,
  linkGuestOrder,
  reorderOrder,
  listInvoices,
  getInvoice,
  downloadInvoice,
  listTracking,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  updateGstDetails,
  listSavedProducts,
  saveProduct,
  removeSavedProduct
};
