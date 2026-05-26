const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { CATALOGUE_PERMISSIONS } = require("./catalogue.permissions");
const controller = require("./catalogue.controller");

function createCatalogueRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/summary",
    requireAdminPermission(CATALOGUE_PERMISSIONS.VIEW),
    controller.adminCatalogueSummary
  );
  router.get(
    "/export/products",
    requireAdminPermission(CATALOGUE_PERMISSIONS.EXPORT),
    controller.adminExportProducts
  );
  router.post(
    "/import/products",
    requireAdminPermission(CATALOGUE_PERMISSIONS.IMPORT),
    controller.adminImportProductsPlaceholder
  );

  return router;
}

module.exports = { createCatalogueRouter };
