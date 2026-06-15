const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const controller = require("./integrations.controller");

function createIntegrationsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get("/", controller.adminGetIntegrations);
  router.patch("/:code", controller.adminUpdateIntegration);

  return router;
}

module.exports = { createIntegrationsRouter };
