const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const { requireAdminPermission } = require("../../middlewares/require-admin-permission");
const { requireCustomerAuth } = require("../../middlewares/require-customer-auth");
const { PRINT_JOBS_PERMISSIONS } = require("../print-jobs/print-jobs.permissions");
const controller = require("./print-uploads.controller");

// Deliberately its own directory, never mounted under express.static --
// see config/env.js's printUploadsDir comment for why (private customer
// files, not public product images).
const uploadsRoot = path.resolve(process.cwd(), env.printUploadsDir);
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
  limits: { fileSize: 25 * 1024 * 1024 }, // hard ceiling; per-product maxFileSizeMb is enforced in the service
  fileFilter: (_req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(file.mimetype)) {
      callback(new Error("Only JPG, PNG or PDF files are accepted."));
      return;
    }
    callback(null, true);
  }
});

function createPrintUploadsRouter() {
  const router = express.Router();

  router.post("/", requireCustomerAuth, upload.single("file"), controller.uploadDesign);
  router.patch("/:uploadId/crop", requireCustomerAuth, controller.updateCrop);

  return router;
}

function createAdminPrintUploadsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);
  router.get(
    "/:uploadId/file",
    requireAdminPermission(PRINT_JOBS_PERMISSIONS.VIEW),
    controller.downloadUploadFile
  );

  return router;
}

module.exports = { createPrintUploadsRouter, createAdminPrintUploadsRouter };
