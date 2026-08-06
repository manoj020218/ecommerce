const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const {
  MANUAL_PAYMENTS_PERMISSIONS
} = require("./manual-payments.permissions");
const controller = require("./manual-payments.controller");

const uploadsRoot = path.resolve(process.cwd(), env.uploadDir, "manual-payments");
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
    const allowed =
      file.mimetype.startsWith("image/") || file.mimetype === "application/pdf";
    if (!allowed) {
      callback(new Error("Only image or PDF files are allowed for payment proof."));
      return;
    }
    callback(null, true);
  }
});

function createPublicManualPaymentsRouter() {
  const router = express.Router();
  router.get("/info", controller.publicGetManualGatewayInfo);
  router.post("/submit", upload.single("file"), controller.publicSubmitManualPayment);
  router.post("/whatsapp-reminder", controller.publicRequestWhatsAppReminder);
  return router;
}

function createAdminManualPaymentsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);
  router.get(
    "/",
    requireAdminPermission(MANUAL_PAYMENTS_PERMISSIONS.VIEW),
    controller.adminListManualPayments
  );
  router.post(
    "/:submissionId/verify",
    requireAdminPermission(MANUAL_PAYMENTS_PERMISSIONS.VERIFY),
    controller.adminVerifyManualPayment
  );
  router.post(
    "/orders/:orderId/demand",
    requireAdminPermission(MANUAL_PAYMENTS_PERMISSIONS.VERIFY),
    controller.adminDemandPayment
  );

  return router;
}

module.exports = {
  createPublicManualPaymentsRouter,
  createAdminManualPaymentsRouter
};
