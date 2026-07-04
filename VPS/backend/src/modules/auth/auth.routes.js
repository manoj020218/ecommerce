const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const { requireCustomerAuth } = require("../../middlewares/require-customer-auth");
const controller = require("./auth.controller");

function createAuthRouter() {
  const router = express.Router();

  router.post("/admin/login", controller.adminLogin);
  router.post("/admin/refresh", controller.adminRefresh);
  router.post("/admin/logout", controller.adminLogout);
  router.get("/admin/me", requireAdminAuth, controller.adminMe);

  router.post("/customer/register-email", controller.customerRegisterEmail);
  router.post("/customer/login-email", controller.customerLoginEmail);
  router.post("/customer/password/forgot", controller.customerForgotPassword);
  router.post("/customer/password/reset", controller.customerResetPassword);
  router.post("/customer/login-google", controller.customerLoginGoogle);
  router.post("/customer/otp/request", controller.customerRequestOtp);
  router.post("/customer/otp/verify", controller.customerVerifyOtp);
  router.post("/customer/refresh", controller.customerRefresh);
  router.post("/customer/logout", controller.customerLogout);
  router.get("/customer/me", requireCustomerAuth, controller.customerMe);
  router.post(
    "/customer/link-identity",
    requireCustomerAuth,
    controller.customerLinkIdentity
  );
  router.get("/customer/cart", requireCustomerAuth, controller.customerCartView);

  router.get("/public/browse", controller.publicBrowseHealth);
  router.get("/public/search", controller.publicSearch);
  router.get("/public/google-config", controller.publicGoogleConfig);
  router.post("/customer/google-exchange", controller.customerGoogleExchange);
  router.post("/public/guest-cart/items", controller.guestCartAddItem);
  router.get("/public/guest-cart/:sessionId", controller.guestCartView);

  router.post("/customer/email-otp/request", controller.customerRequestEmailOtp);
  router.post("/customer/email-otp/verify", controller.customerVerifyEmailOtp);
  router.post("/customer/link-guest-checkout", requireCustomerAuth, controller.customerLinkGuestCheckout);

  return router;
}

module.exports = { createAuthRouter };
