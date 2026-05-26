const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  SETTINGS_PERMISSIONS,
  ensurePermission,
  ensureSuperAdminForCustomCode
} = require("./settings.permissions");
const controller = require("./settings.controller");

const uploadsRoot = path.resolve(process.cwd(), env.uploadDir, "settings");
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
      callback(new Error("Only image files are allowed for branding uploads."));
      return;
    }
    callback(null, true);
  }
});

function createAdminSettingsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);
  router.use(ensurePermission(SETTINGS_PERMISSIONS.VIEW));

  router.get("/", controller.adminGetAllSettings);
  router.get("/:section", controller.adminGetSettingsSection);

  router.put(
    "/store-profile",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    controller.adminUpdateStoreProfile
  );
  router.put(
    "/branding",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    controller.adminUpdateBranding
  );
  router.post(
    "/branding/upload/:assetKey",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    upload.single("file"),
    controller.adminUploadBrandingAsset
  );
  router.put(
    "/seo-defaults",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    controller.adminUpdateSeoDefaults
  );
  router.put(
    "/contact-information",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    controller.adminUpdateContactInformation
  );
  router.put(
    "/custom-code",
    ensureSuperAdminForCustomCode,
    controller.adminUpdateCustomCode
  );
  router.put(
    "/invoice-settings",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    controller.adminUpdateInvoiceSettings
  );
  router.post(
    "/invoice-settings/upload/:assetKey",
    ensurePermission(SETTINGS_PERMISSIONS.EDIT),
    upload.single("file"),
    controller.adminUploadInvoiceAsset
  );

  return router;
}

function createPublicSettingsRouter() {
  const router = express.Router();

  router.get("/bootstrap", controller.publicGetSettingsBootstrap);
  router.get("/store-profile", controller.publicGetStoreProfile);
  router.get("/branding", controller.publicGetBranding);
  router.get("/seo-defaults", controller.publicGetSeoDefaults);
  router.get("/contact-information", controller.publicGetContactInformation);

  return router;
}

module.exports = { createAdminSettingsRouter, createPublicSettingsRouter };
