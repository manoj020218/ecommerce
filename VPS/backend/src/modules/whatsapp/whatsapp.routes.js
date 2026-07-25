const express = require("express");
const { HttpError } = require("../../common/http-error");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const controller = require("./whatsapp.controller");

function ensureSuperAdmin(req, _res, next) {
  if (!req.actor || req.actor.role !== "super_admin") {
    return next(new HttpError(403, "Only Super Admin can manage the WhatsApp connection."));
  }
  return next();
}

function createWhatsappRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);
  router.use(ensureSuperAdmin);

  router.get("/status", controller.getStatus);
  router.post("/connect", controller.connect);
  router.post("/disconnect", controller.disconnect);

  return router;
}

module.exports = { createWhatsappRouter };
