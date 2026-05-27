const express = require("express");
const controller = require("./seo.controller");

function createPublicSeoRouter() {
  const router = express.Router();

  router.get("/sitemap.xml", controller.publicSitemapIndex);
  router.get("/sitemaps/:type.xml", controller.publicTypedSitemap);

  return router;
}

module.exports = { createPublicSeoRouter };
