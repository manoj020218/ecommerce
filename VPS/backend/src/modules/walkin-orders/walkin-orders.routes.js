const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const {
  WALKIN_ORDERS_PERMISSIONS
} = require("./walkin-orders.permissions");
const {
  WALKIN_ORDER_STATUSES
} = require("./walkin-orders.model");
const controller = require("./walkin-orders.controller");

function requireWalkInStatusPermission(req, res, next) {
  if (req.body?.orderStatus === WALKIN_ORDER_STATUSES.CANCELLED) {
    return requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.CANCEL)(req, res, next);
  }

  return requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.EDIT)(req, res, next);
}

function createWalkInOrdersRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.VIEW),
    controller.adminListWalkInOrders
  );
  router.get(
    "/customers",
    requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.VIEW),
    controller.adminSearchWalkInCustomers
  );
  router.get(
    "/products",
    requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.VIEW),
    controller.adminSearchWalkInProducts
  );
  router.get(
    "/categories",
    requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.VIEW),
    controller.adminListWalkInCategories
  );
  router.post(
    "/",
    requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.CREATE),
    controller.adminCreateWalkInOrder
  );
  router.post(
    "/:orderId/confirm-payment",
    requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.EDIT),
    controller.adminConfirmWalkInPayment
  );
  router.post(
    "/:orderId/generate-invoice",
    requireAdminPermission(WALKIN_ORDERS_PERMISSIONS.GENERATE_INVOICE),
    controller.adminGenerateWalkInInvoice
  );
  router.patch(
    "/:orderId/status",
    requireWalkInStatusPermission,
    controller.adminUpdateWalkInOrderStatus
  );

  return router;
}

module.exports = { createWalkInOrdersRouter };
