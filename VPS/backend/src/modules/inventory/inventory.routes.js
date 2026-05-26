const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { INVENTORY_PERMISSIONS } = require("./inventory.permissions");
const controller = require("./inventory.controller");

function createInventoryRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/products/:productId",
    requireAdminPermission(INVENTORY_PERMISSIONS.VIEW),
    controller.adminGetProductInventory
  );
  router.post(
    "/products/:productId/adjust",
    requireAdminPermission(INVENTORY_PERMISSIONS.ADJUST),
    controller.adminAdjustInventory
  );
  router.patch(
    "/products/:productId/policy",
    requireAdminPermission(INVENTORY_PERMISSIONS.EDIT_POLICY),
    controller.adminUpdateInventoryPolicy
  );
  router.get(
    "/movements",
    requireAdminPermission(INVENTORY_PERMISSIONS.VIEW_MOVEMENTS),
    controller.adminListInventoryMovements
  );
  router.get(
    "/low-stock",
    requireAdminPermission(INVENTORY_PERMISSIONS.VIEW_LOW_STOCK),
    controller.adminListLowStockAlerts
  );

  return router;
}

module.exports = { createInventoryRouter };
