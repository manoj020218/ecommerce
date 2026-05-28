const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const controller = require("./marketing.controller");
const { MARKETING_PERMISSIONS } = require("./marketing.permissions");

function createAdminMarketingRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/overview",
    requireAdminPermission(MARKETING_PERMISSIONS.VIEW),
    controller.adminGetMarketingOverview
  );
  router.get(
    "/offers",
    requireAdminPermission(MARKETING_PERMISSIONS.VIEW),
    controller.adminListOffers
  );
  router.post(
    "/offers",
    requireAdminPermission(MARKETING_PERMISSIONS.EDIT_OFFERS),
    controller.adminCreateOffer
  );
  router.patch(
    "/offers/:offerId",
    requireAdminPermission(MARKETING_PERMISSIONS.EDIT_OFFERS),
    controller.adminUpdateOffer
  );
  router.get(
    "/email-templates",
    requireAdminPermission(MARKETING_PERMISSIONS.VIEW),
    controller.adminListEmailTemplates
  );
  router.get(
    "/email-templates/:templateKey",
    requireAdminPermission(MARKETING_PERMISSIONS.VIEW),
    controller.adminGetEmailTemplate
  );
  router.patch(
    "/email-templates/:templateKey",
    requireAdminPermission(MARKETING_PERMISSIONS.EDIT_TEMPLATES),
    controller.adminUpdateEmailTemplate
  );
  router.post(
    "/email-templates/:templateKey/preview",
    requireAdminPermission(MARKETING_PERMISSIONS.VIEW),
    controller.adminPreviewEmailTemplate
  );
  router.get(
    "/notification-logs",
    requireAdminPermission(MARKETING_PERMISSIONS.VIEW),
    controller.adminListNotificationLogs
  );
  router.get(
    "/notify-subscriptions",
    requireAdminPermission(MARKETING_PERMISSIONS.VIEW),
    controller.adminListNotifySubscriptions
  );
  router.post(
    "/notify-subscriptions/:subscriptionId/send",
    requireAdminPermission(MARKETING_PERMISSIONS.EDIT_TEMPLATES),
    controller.adminSendNotifySubscription
  );

  return router;
}

function createPublicMarketingRouter() {
  const router = express.Router();

  router.post(
    "/notify-when-available",
    controller.publicCreateNotifySubscription
  );

  return router;
}

module.exports = { createAdminMarketingRouter, createPublicMarketingRouter };
