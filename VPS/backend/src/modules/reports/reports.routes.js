const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const controller = require("./reports.controller");
const { REPORTS_PERMISSIONS } = require("./reports.permissions");

function createReportsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/:reportKey",
    requireAdminPermission(REPORTS_PERMISSIONS.VIEW),
    controller.adminGetReport
  );
  router.get(
    "/:reportKey/export",
    requireAdminPermission(REPORTS_PERMISSIONS.EXPORT),
    controller.adminExportReport
  );

  return router;
}

module.exports = { createReportsRouter };
