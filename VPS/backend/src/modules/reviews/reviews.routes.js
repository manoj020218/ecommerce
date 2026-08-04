const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const { requireAdminPermission } = require("../../middlewares/require-admin-permission");
const { requireCustomerAuth } = require("../../middlewares/require-customer-auth");
const { REVIEWS_PERMISSIONS } = require("./reviews.permissions");
const controller = require("./reviews.controller");

function createPublicReviewsRouter() {
  const router = express.Router();

  router.get("/", controller.publicListReviews);
  router.post("/", requireCustomerAuth, controller.submitReview);

  return router;
}

function createAdminReviewsRouter() {
  const router = express.Router();

  router.use(requireAdminAuth);

  router.get("/", requireAdminPermission(REVIEWS_PERMISSIONS.VIEW), controller.adminListReviews);
  router.get(
    "/:reviewId",
    requireAdminPermission(REVIEWS_PERMISSIONS.VIEW),
    controller.adminGetReview
  );
  router.patch(
    "/:reviewId/moderate",
    requireAdminPermission(REVIEWS_PERMISSIONS.MODERATE),
    controller.adminModerateReview
  );
  router.delete(
    "/:reviewId",
    requireAdminPermission(REVIEWS_PERMISSIONS.DELETE),
    controller.adminDeleteReview
  );

  return router;
}

module.exports = { createPublicReviewsRouter, createAdminReviewsRouter };
