const express = require("express");
const { HttpError } = require("../../common/http-error");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  hasPermission,
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const controller = require("./customers.controller");
const { CUSTOMERS_PERMISSIONS } = require("./customers.permissions");

function requireCustomerManagePermission(req, _res, next) {
  if (
    req.actor?.role === "super_admin" ||
    hasPermission(req.actor, CUSTOMERS_PERMISSIONS.EDIT) ||
    hasPermission(req.actor, CUSTOMERS_PERMISSIONS.MARK_DEALER)
  ) {
    return next();
  }

  return next(new HttpError(403, "Missing customer management permission."));
}

function createCustomersRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(CUSTOMERS_PERMISSIONS.VIEW),
    controller.adminListCustomers
  );
  router.post(
    "/",
    requireCustomerManagePermission,
    controller.adminCreateCustomer
  );
  router.get(
    "/:customerId/orders",
    requireAdminPermission(CUSTOMERS_PERMISSIONS.VIEW),
    controller.adminGetCustomerOrders
  );
  router.get(
    "/:customerId/cart",
    requireAdminPermission(CUSTOMERS_PERMISSIONS.VIEW),
    controller.adminGetCustomerCart
  );
  router.get(
    "/:customerId/addresses",
    requireAdminPermission(CUSTOMERS_PERMISSIONS.VIEW),
    controller.adminListCustomerAddresses
  );
  router.post(
    "/:customerId/addresses",
    requireCustomerManagePermission,
    controller.adminCreateCustomerAddress
  );
  router.patch(
    "/:customerId/addresses/:addressId",
    requireCustomerManagePermission,
    controller.adminUpdateCustomerAddress
  );
  router.delete(
    "/:customerId/addresses/:addressId",
    requireCustomerManagePermission,
    controller.adminDeleteCustomerAddress
  );
  router.get(
    "/:customerId",
    requireAdminPermission(CUSTOMERS_PERMISSIONS.VIEW),
    controller.adminGetCustomer
  );
  router.patch("/:customerId", requireCustomerManagePermission, controller.adminUpdateCustomer);
  router.get(
    "/order-requests/list",
    requireAdminPermission(CUSTOMERS_PERMISSIONS.VIEW),
    controller.adminListOrderRequests
  );
  router.post(
    "/order-requests/:orderId/approve",
    requireCustomerManagePermission,
    controller.adminApproveOrderRequest
  );
  router.patch(
    "/order-requests/:orderId/status",
    requireCustomerManagePermission,
    controller.adminUpdateB2BOrderStatus
  );

  return router;
}

module.exports = { createCustomersRouter };
