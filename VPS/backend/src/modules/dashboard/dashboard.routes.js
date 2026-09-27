const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const controller = require("./dashboard.controller");

function createDashboardRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);
  router.get("/", controller.adminGetDashboard);
  // Added 2026-09-27: chart Week/Month/Year toggle + product visits vs sales
  router.get("/trend", controller.adminGetOrderTrend);
  router.get("/product-performance", controller.adminGetProductPerformance);
  return router;
}

module.exports = { createDashboardRouter };
