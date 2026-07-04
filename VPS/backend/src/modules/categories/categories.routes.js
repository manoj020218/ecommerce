const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { CATEGORIES_PERMISSIONS } = require("./categories.permissions");
const controller = require("./categories.controller");

const categoryUploadsRoot = path.resolve(process.cwd(), env.uploadDir, "categories");
fs.mkdirSync(categoryUploadsRoot, { recursive: true });

const categoryImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, categoryUploadsRoot),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: env.maxUploadSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed for category images."));
      return;
    }
    cb(null, true);
  }
});

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

  router.post(
    "/:categoryId/image",
    requireAdminPermission(CATEGORIES_PERMISSIONS.EDIT),
    categoryImageUpload.single("file"),
    controller.adminUploadCategoryImage
  );

  return router;
}

function createPublicCategoriesRouter() {
  const router = express.Router();

  router.get("/", controller.publicListCategories);

  return router;
}

module.exports = { createAdminCategoriesRouter, createPublicCategoriesRouter };
