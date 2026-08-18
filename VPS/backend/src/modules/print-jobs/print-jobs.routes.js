const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const { requireAdminPermission } = require("../../middlewares/require-admin-permission");
const { PRINT_JOBS_PERMISSIONS } = require("./print-jobs.permissions");
const controller = require("./print-jobs.controller");

function createAdminPrintJobsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(PRINT_JOBS_PERMISSIONS.VIEW),
    controller.adminListPrintJobs
  );
  router.get(
    "/:orderId/:lineId",
    requireAdminPermission(PRINT_JOBS_PERMISSIONS.VIEW),
    controller.adminGetPrintJob
  );
  router.patch(
    "/:orderId/:lineId/moderate",
    requireAdminPermission(PRINT_JOBS_PERMISSIONS.MODERATE),
    controller.adminModeratePrintJob
  );

  return router;
}

module.exports = { createAdminPrintJobsRouter };
