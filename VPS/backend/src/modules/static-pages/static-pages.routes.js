const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const controller = require("./static-pages.controller");

function createPublicStaticPagesRouter() {
  const router = express.Router();
  router.get("/", controller.publicListPages);
  router.get("/:slug", controller.publicGetPage);
  return router;
}

function createAdminStaticPagesRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);
  router.get("/", controller.adminListPages);
  router.get("/:id", controller.adminGetPage);
  router.post("/", controller.adminCreatePage);
  router.put("/:id", controller.adminUpdatePage);
  router.delete("/:id", controller.adminDeletePage);
  return router;
}

module.exports = { createPublicStaticPagesRouter, createAdminStaticPagesRouter };
