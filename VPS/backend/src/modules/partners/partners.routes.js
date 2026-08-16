const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const { requireAdminPermission } = require("../../middlewares/require-admin-permission");
const { PARTNERS_PERMISSIONS } = require("./partners.permissions");
const controller = require("./partners.controller");

function createAdminPartnersRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get("/", requireAdminPermission(PARTNERS_PERMISSIONS.VIEW), controller.adminListPartners);
  router.post("/", requireAdminPermission(PARTNERS_PERMISSIONS.MANAGE), controller.adminCreatePartner);
  router.get(
    "/:partnerId",
    requireAdminPermission(PARTNERS_PERMISSIONS.VIEW),
    controller.adminGetPartner
  );
  router.patch(
    "/:partnerId",
    requireAdminPermission(PARTNERS_PERMISSIONS.MANAGE),
    controller.adminUpdatePartner
  );
  router.delete(
    "/:partnerId",
    requireAdminPermission(PARTNERS_PERMISSIONS.MANAGE),
    controller.adminDeletePartner
  );
  router.post(
    "/:partnerId/regenerate-key",
    requireAdminPermission(PARTNERS_PERMISSIONS.MANAGE),
    controller.adminRegeneratePartnerApiKey
  );
  router.post(
    "/:partnerId/products",
    requireAdminPermission(PARTNERS_PERMISSIONS.MANAGE),
    controller.adminAssignProducts
  );
  router.get(
    "/:partnerId/commissions",
    requireAdminPermission(PARTNERS_PERMISSIONS.VIEW),
    controller.adminListCommissions
  );
  router.patch(
    "/commissions/:ledgerId/mark-paid",
    requireAdminPermission(PARTNERS_PERMISSIONS.MANAGE),
    controller.adminMarkCommissionPaid
  );

  return router;
}

function createPublicPartnersRouter() {
  const router = express.Router();

  router.get("/resolve/:code", controller.publicResolvePartner);

  return router;
}

function createPublicPartnerFeedRouter() {
  const router = express.Router();

  router.get("/:code", controller.publicPartnerFeed);

  return router;
}

module.exports = {
  createAdminPartnersRouter,
  createPublicPartnersRouter,
  createPublicPartnerFeedRouter
};
