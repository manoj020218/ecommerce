const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { AUDIT_LOGS_PERMISSIONS } = require("./audit-logs.permissions");
const { adminListAuditLogs } = require("./audit-logs.controller");

function createAuditLogsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);
  router.use(requireAdminPermission(AUDIT_LOGS_PERMISSIONS.VIEW));

  router.get("/", adminListAuditLogs);

  return router;
}

module.exports = { createAuditLogsRouter };
