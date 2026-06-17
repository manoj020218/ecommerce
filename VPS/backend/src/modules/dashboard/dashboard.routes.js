const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const controller = require("./dashboard.controller");

function createDashboardRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);
  router.get("/", controller.adminGetDashboard);
  return router;
}

module.exports = { createDashboardRouter };
