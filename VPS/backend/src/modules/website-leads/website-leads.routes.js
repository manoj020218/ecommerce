const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const controller = require("./website-leads.controller");
const { WEBSITE_LEADS_PERMISSIONS } = require("./website-leads.permissions");

function createAdminWebsiteLeadsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(WEBSITE_LEADS_PERMISSIONS.VIEW),
    controller.adminListWebsiteLeads
  );
  router.patch(
    "/:leadId",
    requireAdminPermission(WEBSITE_LEADS_PERMISSIONS.EDIT),
    controller.adminUpdateWebsiteLead
  );

  return router;
}

function createPublicWebsiteLeadsRouter() {
  const router = express.Router();

  router.post("/", controller.publicCreateWebsiteLead);

  return router;
}

module.exports = {
  createAdminWebsiteLeadsRouter,
  createPublicWebsiteLeadsRouter
};
