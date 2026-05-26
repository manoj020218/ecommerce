const express = require("express");
const { requireCustomerAuth } = require("../../middlewares/require-customer-auth");
const controller = require("./customer-account.controller");

function createCustomerAccountRouter() {
  const router = express.Router();

  router.use(requireCustomerAuth);

  router.get("/bootstrap", controller.getBootstrap);
  router.patch("/profile", controller.updateProfile);

  router.get("/orders", controller.listOrders);
  router.post("/orders/link-guest", controller.linkGuestOrder);
  router.get("/orders/:orderId", controller.getOrderDetail);
  router.post("/orders/:orderId/reorder", controller.reorderOrder);

  router.get("/invoices", controller.listInvoices);
  router.get("/invoices/:invoiceId", controller.getInvoice);
  router.get("/invoices/:invoiceId/download", controller.downloadInvoice);

  router.get("/tracking", controller.listTracking);

  router.get("/addresses", controller.listAddresses);
  router.post("/addresses", controller.createAddress);
  router.patch("/addresses/:addressId", controller.updateAddress);
  router.delete("/addresses/:addressId", controller.deleteAddress);

  router.put("/gst-details", controller.updateGstDetails);

  router.get("/saved-products", controller.listSavedProducts);
  router.post("/saved-products/:productId", controller.saveProduct);
  router.delete("/saved-products/:productId", controller.removeSavedProduct);

  return router;
}

module.exports = { createCustomerAccountRouter };
