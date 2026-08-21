const express = require("express");
const controller = require("./prerender.controller");

// /prerender/categories/:slug and /prerender/guides/:slug are still
// bot-only (nginx's $is_crawler gate). /prerender/products/:slug is now hit
// by EVERY real visitor too (2026-08-12 SSR rollout) — critical bug found
// the same day: app.js's global helmet() applies a strict default CSP
// (script-src 'self', no connect-src -> falls back to default-src 'self')
// meant for pure JSON API responses. Once product pages started being
// served as full HTML documents through this same Express app instead of
// as static files via nginx, that CSP applied to the DOCUMENT too and
// silently blocked every fetch() the page made afterward (categories, cart,
// the product itself), GTM, the Facebook Pixel, and even this module's own
// injected __INITIAL_PRODUCT__ script tag — real browsers enforce CSP,
// curl doesn't, which is why server-side testing never caught this.
// Stripping the header here restores exactly the unrestricted behavior
// these pages always had as static files.
function removeCsp(_req, res, next) {
  res.removeHeader("Content-Security-Policy");
  next();
}

function createPublicPrerenderRouter() {
  const router = express.Router();

  router.get("/prerender/products/:slug", removeCsp, controller.prerenderProductPage);
  router.get("/prerender/categories/:slug", controller.prerenderCategoryPage);
  router.get("/prerender/guides/:slug", controller.prerenderBlogPage);
  router.get("/prerender/careers/:slug", controller.prerenderJobVacancyPage);

  return router;
}

module.exports = { createPublicPrerenderRouter };
