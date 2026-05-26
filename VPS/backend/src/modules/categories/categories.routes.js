const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { CATEGORIES_PERMISSIONS } = require("./categories.permissions");
const controller = require("./categories.controller");

function createAdminCategoriesRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(CATEGORIES_PERMISSIONS.VIEW),
    controller.adminListCategories
  );
  router.get(
    "/:categoryId",
    requireAdminPermission(CATEGORIES_PERMISSIONS.VIEW),
    controller.adminGetCategory
  );
  router.post(
    "/",
    requireAdminPermission(CATEGORIES_PERMISSIONS.CREATE),
    controller.adminCreateCategory
  );
  router.patch(
    "/:categoryId",
    requireAdminPermission(CATEGORIES_PERMISSIONS.EDIT),
    controller.adminUpdateCategory
  );
  router.delete(
    "/:categoryId",
    requireAdminPermission(CATEGORIES_PERMISSIONS.DELETE),
    controller.adminArchiveCategory
  );

  return router;
}

function createPublicCategoriesRouter() {
  const router = express.Router();

  router.get("/", controller.publicListCategories);

  return router;
}

module.exports = { createAdminCategoriesRouter, createPublicCategoriesRouter };
