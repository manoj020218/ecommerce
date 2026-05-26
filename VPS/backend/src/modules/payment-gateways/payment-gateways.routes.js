const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const {
  PAYMENT_GATEWAYS_PERMISSIONS
} = require("./payment-gateways.permissions");
const controller = require("./payment-gateways.controller");

function createPaymentGatewaysRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(PAYMENT_GATEWAYS_PERMISSIONS.VIEW),
    controller.adminListPaymentGateways
  );
  router.patch(
    "/discount/direct-payment",
    requireAdminPermission(PAYMENT_GATEWAYS_PERMISSIONS.MANAGE),
    controller.adminUpdateDirectDiscount
  );
  router.patch(
    "/:gatewayCode",
    requireAdminPermission(PAYMENT_GATEWAYS_PERMISSIONS.MANAGE),
    controller.adminUpdatePaymentGateway
  );

  return router;
}

module.exports = { createPaymentGatewaysRouter };
