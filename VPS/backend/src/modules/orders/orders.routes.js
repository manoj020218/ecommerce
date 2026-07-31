const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const controller = require("./orders.controller");
const { ORDERS_PERMISSIONS } = require("./orders.permissions");

function createOrdersRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(ORDERS_PERMISSIONS.VIEW),
    controller.adminListOrders
  );
  // export and stuck-payments must come before /:orderId to avoid route conflict
  router.get(
    "/export",
    requireAdminPermission(ORDERS_PERMISSIONS.VIEW),
    controller.adminExportOrders
  );
  router.get(
    "/stuck-payments",
    requireAdminPermission(ORDERS_PERMISSIONS.VIEW),
    controller.adminListStuckPaymentSessions
  );
  router.get(
    "/:orderId",
    requireAdminPermission(ORDERS_PERMISSIONS.VIEW),
    controller.adminGetOrderDetail
  );
  router.patch(
    "/:orderId",
    requireAdminPermission(ORDERS_PERMISSIONS.VIEW),
    controller.adminUpdateOrder
  );

  return router;
}

module.exports = { createOrdersRouter };
