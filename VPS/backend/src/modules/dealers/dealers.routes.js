const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const { requireAdminPermission } = require("../../middlewares/require-admin-permission");
// Dealers are customers, so they use the existing Customers permissions
// (no change to the shared roles model).
const { CUSTOMERS_PERMISSIONS } = require("../customers/customers.permissions");
const controller = require("./dealers.controller");

function createAdminDealersRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);
  router.get("/", requireAdminPermission(CUSTOMERS_PERMISSIONS.VIEW), controller.adminListDealers);
  router.get("/:customerId", requireAdminPermission(CUSTOMERS_PERMISSIONS.VIEW), controller.adminGetDealer);
  router.patch("/:customerId", requireAdminPermission(CUSTOMERS_PERMISSIONS.EDIT), controller.adminUpdateDealer);
  return router;
}

function createPublicDealersRouter() {
  const router = express.Router();
  router.get("/form-options", controller.publicFormOptions);
  router.post("/register", controller.publicRegister);
  return router;
}

module.exports = { createAdminDealersRouter, createPublicDealersRouter };
