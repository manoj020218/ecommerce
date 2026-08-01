const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { INVOICES_PERMISSIONS } = require("./invoices.permissions");
const controller = require("./invoices.controller");

function createInvoicesRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(INVOICES_PERMISSIONS.VIEW),
    controller.adminListInvoices
  );
  router.get(
    "/order/:orderId",
    requireAdminPermission(INVOICES_PERMISSIONS.VIEW),
    controller.adminGetInvoiceForOrder
  );
  router.post(
    "/order/:orderId/generate",
    requireAdminPermission(INVOICES_PERMISSIONS.GENERATE),
    controller.adminGenerateInvoice
  );
  router.get(
    "/:invoiceId/download",
    requireAdminPermission(INVOICES_PERMISSIONS.DOWNLOAD),
    controller.adminDownloadInvoice
  );
  router.patch(
    "/:invoiceId/buyer-details",
    requireAdminPermission(INVOICES_PERMISSIONS.EDIT_BUYER_DETAILS),
    controller.adminCorrectInvoiceBuyer
  );
  router.get(
    "/:invoiceId",
    requireAdminPermission(INVOICES_PERMISSIONS.VIEW),
    controller.adminGetInvoice
  );

  return router;
}

module.exports = { createInvoicesRouter };
