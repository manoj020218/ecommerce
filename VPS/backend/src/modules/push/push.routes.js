const express = require("express");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const { requireCustomerAuth } = require("../../middlewares/require-customer-auth");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const { requireAdminPermission } = require("../../middlewares/require-admin-permission");
const { MARKETING_PERMISSIONS } = require("../marketing/marketing.permissions");
const service = require("./push.service");

// App push notifications (2026-10-03)

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// /api/push — public: the VAPID public key the phone needs to subscribe
function createPublicPushRouter() {
  const router = express.Router();
  router.get("/public-key", asyncHandler(async (_req, res) => ok(res, await service.getPublicKey(), "Push key.")));
  return router;
}

// /api/customer/push — logged-in buyer
function createCustomerPushRouter() {
  const router = express.Router();
  router.use(requireCustomerAuth);
  router.get("/status", asyncHandler(async (req, res) => ok(res, await service.customerPushStatus(req.customer.id), "Push status.")));
  router.post("/subscribe", asyncHandler(async (req, res) =>
    created(res, await service.subscribe(req.customer.id, req.body?.subscription, req.get("user-agent") || ""), "Notifications switched on.")));
  router.post("/unsubscribe", asyncHandler(async (req, res) =>
    ok(res, await service.unsubscribe(req.customer.id, String(req.body?.endpoint || "")), "Notifications switched off.")));
  router.get("/notifications", asyncHandler(async (req, res) =>
    ok(res, await service.listCustomerNotifications(req.customer.id), "Notifications.")));
  return router;
}

// /api/admin/push — "App Notifications" page (offers / new products)
function createAdminPushRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);
  router.get("/", requireAdminPermission(MARKETING_PERMISSIONS.VIEW), asyncHandler(async (_req, res) =>
    ok(res, await service.adminSummary(), "App notification summary.")));
  router.post("/send", requireAdminPermission(MARKETING_PERMISSIONS.EDIT_OFFERS), asyncHandler(async (req, res) => {
    const { title, body, url, image, audience } = req.body || {};
    if (!String(body || "").trim()) throw new HttpError(400, "Please write the message.");
    return created(res, await service.broadcast({ title, body, url, image, audience }, req.actor), "Notification sent.");
  }));
  return router;
}

module.exports = { createPublicPushRouter, createCustomerPushRouter, createAdminPushRouter };
