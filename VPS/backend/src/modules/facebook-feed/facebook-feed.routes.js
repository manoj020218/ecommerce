const express = require("express");
const controller = require("./facebook-feed.controller");

function createPublicFacebookFeedRouter() {
  const router = express.Router();

  router.get("/facebook-product-feed.xml", controller.publicFacebookProductFeed);

  return router;
}

module.exports = { createPublicFacebookFeedRouter };
