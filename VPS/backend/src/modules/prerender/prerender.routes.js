const express = require("express");
const controller = require("./prerender.controller");

// Only reached via nginx's bot-only routing (see the `map $http_user_agent
// $is_crawler` block in jenixindia.conf) — real browser traffic never hits
// this, it keeps getting the plain SPA build exactly as before.
function createPublicPrerenderRouter() {
  const router = express.Router();

  router.get("/prerender/products/:slug", controller.prerenderProductPage);
  router.get("/prerender/categories/:slug", controller.prerenderCategoryPage);
  router.get("/prerender/guides/:slug", controller.prerenderBlogPage);

  return router;
}

module.exports = { createPublicPrerenderRouter };
