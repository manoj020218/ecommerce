const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const {
  ABANDONED_CART_PERMISSIONS
} = require("./abandoned-cart.permissions");
const controller = require("./abandoned-cart.controller");

function createAdminAbandonedCartRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/summary",
    requireAdminPermission(ABANDONED_CART_PERMISSIONS.VIEW),
    controller.adminGetRecoverySummary
  );
  router.get(
    "/",
    requireAdminPermission(ABANDONED_CART_PERMISSIONS.VIEW),
    controller.adminListRecoveries
  );
  router.get(
    "/:recoveryId",
    requireAdminPermission(ABANDONED_CART_PERMISSIONS.VIEW),
    controller.adminGetRecoveryDetail
  );
  router.post(
    "/reminders/run",
    requireAdminPermission(ABANDONED_CART_PERMISSIONS.SEND_REMINDERS),
    controller.adminRunReminders
  );

  return router;
}

function createPublicRecoveryRouter() {
  const router = express.Router();

  router.get("/:recoveryToken", controller.publicGetRecoveryPreview);
  router.post("/:recoveryToken/restore", controller.publicRestoreRecovery);
  router.post("/:recoveryToken/feedback", controller.publicSaveRecoveryFeedback);

  return router;
}

module.exports = {
  createAdminAbandonedCartRouter,
  createPublicRecoveryRouter
};
