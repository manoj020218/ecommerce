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

const videoUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, callback) => {
    const allowed = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"];
    if (!allowed.includes(file.mimetype) && !file.originalname.match(/\.(mp4|webm|mov|avi)$/i)) {
      callback(new Error("Only video files (mp4, webm, mov, avi) are allowed."));
      return;
    }
    callback(null, true);
  }
});

const documentUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, callback) => {
    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const okExt = file.originalname.match(/\.(pdf|doc|docx)$/i);
    if (!allowed.includes(file.mimetype) && !okExt) {
      callback(new Error("Only PDF or Word documents are allowed."));
      return;
    }
    callback(null, true);
  }
});

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max for import files
  fileFilter: (_req, file, callback) => {
    const ok = file.mimetype === "application/json" ||
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.originalname.endsWith(".json") ||
      file.originalname.endsWith(".csv");
    if (!ok) {
      callback(new Error("Only .json or .csv files are accepted for import."));
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
  router.post(
    "/bulk-import",
    requireAdminPermission(PRODUCTS_PERMISSIONS.CREATE),
    controller.adminBulkImportProducts
  );
  router.post(
    "/import-file",
    requireAdminPermission(PRODUCTS_PERMISSIONS.CREATE),
    importUpload.single("file"),
    controller.adminImportProductsFile
  );
  router.patch(
    "/bulk-patch",
    requireAdminPermission(PRODUCTS_PERMISSIONS.EDIT),
    controller.adminBulkPatchProducts
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
    "/:productId/images",
    requireAdminPermission(PRODUCTS_PERMISSIONS.EDIT),
    controller.adminDeleteProductImage
  );
  router.post(
    "/:productId/videos",
    requireAdminPermission(PRODUCTS_PERMISSIONS.EDIT),
    videoUpload.single("file"),
    controller.adminUploadProductVideo
  );
  router.post(
    "/:productId/documents",
    requireAdminPermission(PRODUCTS_PERMISSIONS.EDIT),
    documentUpload.single("file"),
    controller.adminUploadProductDocument
  );
  router.get(
    "/google-shopping-export",
    requireAdminPermission(PRODUCTS_PERMISSIONS.VIEW),
    controller.adminExportGoogleShopping
  );
  router.delete(
    "/:productId/permanent",
    requireAdminPermission(PRODUCTS_PERMISSIONS.DELETE),
    controller.adminDeleteProduct
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
