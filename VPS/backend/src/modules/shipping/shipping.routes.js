const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { SHIPPING_PERMISSIONS } = require("./shipping.permissions");
const controller = require("./shipping.controller");

const uploadsRoot = path.resolve(process.cwd(), env.uploadDir, "shipping", "pod");
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
      callback(new Error("Only image or PDF files are allowed for POD upload."));
      return;
    }
    callback(null, true);
  }
});

function createAdminShippingRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get(
    "/settings",
    requireAdminPermission(SHIPPING_PERMISSIONS.VIEW),
    controller.adminGetShippingSettings
  );
  router.patch(
    "/settings",
    requireAdminPermission(SHIPPING_PERMISSIONS.CREATE),
    controller.adminPatchShippingSettings
  );
  router.get(
    "/rate-cards",
    requireAdminPermission(SHIPPING_PERMISSIONS.VIEW),
    controller.adminListRateCards
  );
  router.post(
    "/rate-cards",
    requireAdminPermission(SHIPPING_PERMISSIONS.CREATE),
    controller.adminCreateRateCard
  );
  router.patch(
    "/rate-cards/:rateCardId",
    requireAdminPermission(SHIPPING_PERMISSIONS.CREATE),
    controller.adminUpdateRateCard
  );

  router.get(
    "/couriers",
    requireAdminPermission(SHIPPING_PERMISSIONS.VIEW),
    controller.adminListCouriers
  );
  router.post(
    "/couriers",
    requireAdminPermission(SHIPPING_PERMISSIONS.CREATE),
    controller.adminCreateCourier
  );
  router.patch(
    "/couriers/:courierProfileId",
    requireAdminPermission(SHIPPING_PERMISSIONS.CREATE),
    controller.adminUpdateCourier
  );

  router.get(
    "/queue",
    requireAdminPermission(SHIPPING_PERMISSIONS.VIEW),
    controller.adminListShippingQueue
  );
  router.post(
    "/shipments",
    requireAdminPermission(SHIPPING_PERMISSIONS.CREATE),
    controller.adminCreateShipment
  );
  router.get(
    "/shipments/:shipmentId",
    requireAdminPermission(SHIPPING_PERMISSIONS.VIEW),
    controller.adminGetShipment
  );
  router.patch(
    "/shipments/:shipmentId/tracking",
    requireAdminPermission(SHIPPING_PERMISSIONS.UPDATE_TRACKING),
    controller.adminUpdateShipmentTracking
  );
  router.patch(
    "/shipments/:shipmentId/status",
    requireAdminPermission(SHIPPING_PERMISSIONS.MARK_DELIVERED),
    controller.adminUpdateShipmentStatus
  );
  router.post(
    "/shipments/:shipmentId/tracking-email",
    requireAdminPermission(SHIPPING_PERMISSIONS.UPDATE_TRACKING),
    controller.adminSendTrackingEmail
  );
  router.post(
    "/shipments/:shipmentId/pod",
    requireAdminPermission(SHIPPING_PERMISSIONS.UPLOAD_POD),
    upload.single("file"),
    controller.adminUploadShipmentPod
  );

  return router;
}

function createPublicShippingRouter() {
  const router = express.Router();

  router.get("/cart-estimate", controller.publicEstimateCartShipping);
  router.get("/tracking/:trackingId", controller.publicTrackShipment);

  return router;
}

module.exports = { createAdminShippingRouter, createPublicShippingRouter };
