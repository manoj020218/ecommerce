const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { PRODUCTS_PERMISSIONS } = require("./products.permissions");
const controller = require("./products.controller");

const uploadsRoot = path.resolve(process.cwd(), env.uploadDir, "products");
fs.mkdirSync(uploadsRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsRoot);
  },
  filename: (_req, file, callback) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    callback(null, `${Date.now()}-${safeOriginal}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadSizeBytes },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("Only image files are allowed for product images."));
      return;
    }
    callback(null, true);
  }
});

function createAdminProductsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/",
    requireAdminPermission(PRODUCTS_PERMISSIONS.VIEW),
    controller.adminListProducts
  );
  router.get(
    "/:productId",
    requireAdminPermission(PRODUCTS_PERMISSIONS.VIEW),
    controller.adminGetProduct
  );
  router.post(
    "/",
    requireAdminPermission(PRODUCTS_PERMISSIONS.CREATE),
    controller.adminCreateProduct
  );
  router.patch(
    "/:productId",
    requireAdminPermission(PRODUCTS_PERMISSIONS.EDIT),
    controller.adminUpdateProduct
  );
  router.put(
    "/:productId/relations",
    requireAdminPermission(PRODUCTS_PERMISSIONS.EDIT),
    controller.adminUpdateProductRelations
  );
  router.post(
    "/:productId/images",
    requireAdminPermission(PRODUCTS_PERMISSIONS.EDIT),
    upload.single("file"),
    controller.adminUploadProductImage
  );
  router.delete(
    "/:productId",
    requireAdminPermission(PRODUCTS_PERMISSIONS.DELETE),
    controller.adminArchiveProduct
  );

  return router;
}

function createPublicProductsRouter() {
  const router = express.Router();

  router.get("/", controller.publicListProducts);
  router.get("/:slug/page", controller.publicGetProductPage);
  router.get("/:slug/recommendations", controller.publicGetProductRecommendations);
  router.post("/:slug/shipping-estimate", controller.publicEstimateShipping);
  router.get("/:slug", controller.publicGetProductBySlug);

  return router;
}

module.exports = { createAdminProductsRouter, createPublicProductsRouter };
