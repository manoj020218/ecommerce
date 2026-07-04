const express = require("express");
const controller = require("./seo.controller");
const gmController = require("../google-merchant/google-merchant.controller");
const fbController = require("../facebook-feed/facebook-feed.controller");

function createPublicSeoRouter() {
  const router = express.Router();

  router.get("/sitemap.xml", controller.publicSitemapIndex);
  router.get("/sitemaps/:type.xml", controller.publicTypedSitemap);
  router.get("/robots.txt", controller.publicRobotsTxt);
  // Canonical feed URLs (Google Merchant Center / Facebook Catalog)
  router.get("/feed/google.xml", gmController.publicMerchantFeed);
  router.get("/feed/facebook.xml", fbController.publicFacebookProductFeed);

  return router;
}

module.exports = { createPublicSeoRouter };
