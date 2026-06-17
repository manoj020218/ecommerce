const express = require("express");
const { requireCustomerAuth } = require("../../middlewares/require-customer-auth");
const controller = require("./cart-checkout.controller");

function createCartRouter() {
  const router = express.Router();

  router.get("/", controller.getCart);
  router.post("/items", controller.addCartItem);
  router.patch("/items/:productId", controller.updateCartItem);
  router.delete("/items/:productId", controller.deleteCartItem);
  router.post("/merge", requireCustomerAuth, controller.mergeGuestCart);
  router.post("/share", controller.shareCart);
  router.get("/shared/:shareToken", controller.getSharedCart);
  router.post("/shared/:shareToken/claim", controller.claimSharedCart);

  return router;
}

function createCheckoutRouter() {
  const router = express.Router();

  router.post("/start", controller.checkoutStart);
  router.get("/:checkoutSessionId/follow-up", controller.checkoutGetFollowup);
  router.get("/:checkoutSessionId/invoice", controller.checkoutDownloadInvoice);
  router.get("/:checkoutSessionId", controller.checkoutGetSession);

  return router;
}

function createPaymentsRouter() {
  const router = express.Router();

  router.post("/create-attempt", controller.paymentsCreateAttempt);
  router.post("/webhook/mock", controller.paymentsWebhookMock);
  router.post("/webhook/:gateway", controller.paymentsWebhookGateway);

  return router;
}

module.exports = {
  createCartRouter,
  createCheckoutRouter,
  createPaymentsRouter
};
