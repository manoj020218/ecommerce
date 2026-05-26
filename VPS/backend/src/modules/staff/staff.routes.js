const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { STAFF_PERMISSIONS } = require("./staff.permissions");
const controller = require("./staff.controller");

function createStaffRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(STAFF_PERMISSIONS.VIEW),
    controller.adminListStaffUsers
  );
  router.post(
    "/",
    requireAdminPermission(STAFF_PERMISSIONS.CREATE),
    controller.adminCreateStaffUser
  );
  router.patch(
    "/:staffId",
    requireAdminPermission(STAFF_PERMISSIONS.UPDATE),
    controller.adminUpdateStaffUser
  );
  router.patch(
    "/:staffId/password",
    requireAdminPermission(STAFF_PERMISSIONS.UPDATE),
    controller.adminUpdateStaffPassword
  );

  return router;
}

module.exports = { createStaffRouter };
