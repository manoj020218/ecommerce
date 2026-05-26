const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { ROLES_PERMISSIONS_ACCESS } = require("./roles-permissions.permissions");
const controller = require("./roles-permissions.controller");

function createRolesPermissionsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/available-permissions",
    requireAdminPermission(ROLES_PERMISSIONS_ACCESS.VIEW),
    controller.adminListAvailablePermissions
  );
  router.get(
    "/",
    requireAdminPermission(ROLES_PERMISSIONS_ACCESS.VIEW),
    controller.adminListPermissionGroups
  );
  router.get(
    "/:groupId",
    requireAdminPermission(ROLES_PERMISSIONS_ACCESS.VIEW),
    controller.adminGetPermissionGroup
  );
  router.post(
    "/",
    requireAdminPermission(ROLES_PERMISSIONS_ACCESS.MANAGE),
    controller.adminCreatePermissionGroup
  );
  router.patch(
    "/:groupId",
    requireAdminPermission(ROLES_PERMISSIONS_ACCESS.MANAGE),
    controller.adminUpdatePermissionGroup
  );

  return router;
}

module.exports = { createRolesPermissionsRouter };
