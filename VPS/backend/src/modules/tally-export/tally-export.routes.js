const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { TALLY_EXPORT_PERMISSIONS } = require("./tally-export.permissions");
const controller = require("./tally-export.controller");

function createTallyExportRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);
  router.get(
    "/",
    requireAdminPermission(TALLY_EXPORT_PERMISSIONS.EXPORT),
    controller.adminExportTallyCsv
  );

  return router;
}

module.exports = { createTallyExportRouter };
