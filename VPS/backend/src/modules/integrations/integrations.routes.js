const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const controller = require("./integrations.controller");

function createIntegrationsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get("/", controller.adminGetIntegrations);

  // Custom courier routes — must come before /:code to avoid pattern conflict
  router.get("/couriers", controller.adminListCouriers);
  router.post("/couriers", controller.adminAddCourier);
  router.patch("/couriers/:id", controller.adminUpdateCourier);
  router.delete("/couriers/:id", controller.adminDeleteCourier);

  // Generic integration toggle/update — after specific routes
  router.patch("/:code", controller.adminUpdateIntegration);

  return router;
}

module.exports = { createIntegrationsRouter };
