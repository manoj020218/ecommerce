const express = require("express");
const controller = require("./google-merchant.controller");

function createPublicGoogleMerchantRouter() {
  const router = express.Router();

  router.get("/google-merchant-feed.xml", controller.publicMerchantFeed);

  return router;
}

module.exports = { createPublicGoogleMerchantRouter };
