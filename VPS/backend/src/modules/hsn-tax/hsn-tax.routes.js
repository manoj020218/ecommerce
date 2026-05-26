const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { HSN_TAX_PERMISSIONS } = require("./hsn-tax.permissions");
const controller = require("./hsn-tax.controller");

function createHsnTaxRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(HSN_TAX_PERMISSIONS.VIEW),
    controller.adminListHsnRecords
  );
  router.get(
    "/:hsnCode",
    requireAdminPermission(HSN_TAX_PERMISSIONS.VIEW),
    controller.adminGetHsnRecord
  );
  router.post(
    "/",
    requireAdminPermission(HSN_TAX_PERMISSIONS.CREATE),
    controller.adminCreateHsnRecord
  );
  router.patch(
    "/:hsnCode",
    requireAdminPermission(HSN_TAX_PERMISSIONS.EDIT),
    controller.adminUpdateHsnRecord
  );
  router.delete(
    "/:hsnCode",
    requireAdminPermission(HSN_TAX_PERMISSIONS.DELETE),
    controller.adminArchiveHsnRecord
  );

  return router;
}

module.exports = { createHsnTaxRouter };
