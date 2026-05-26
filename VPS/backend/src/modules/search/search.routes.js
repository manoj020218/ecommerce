const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { requireCustomerAuth } = require("../../middlewares/require-customer-auth");
const { SEARCH_PERMISSIONS } = require("./search.permissions");
const controller = require("./search.controller");

function createSearchRouter() {
  const router = express.Router();

  router.get("/", controller.publicSearch);
  router.get("/suggest", controller.publicSuggest);
  router.post("/click", controller.publicTrackSearchClick);
  router.post("/view", requireCustomerAuth, controller.customerTrackSearchView);
  router.get("/history", requireCustomerAuth, controller.customerSearchHistory);
  router.get("/recent-viewed", requireCustomerAuth, controller.customerViewedHistory);

  return router;
}

function createAdminSearchRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);

  router.get(
    "/overview",
    requireAdminPermission(SEARCH_PERMISSIONS.VIEW_ADMIN),
    controller.adminSearchOverview
  );

  router.get(
    "/synonyms",
    requireAdminPermission(SEARCH_PERMISSIONS.VIEW_ADMIN),
    controller.adminListSynonyms
  );
  router.post(
    "/synonyms",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_SYNONYMS),
    controller.adminCreateSynonym
  );
  router.patch(
    "/synonyms/:synonymId",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_SYNONYMS),
    controller.adminUpdateSynonym
  );
  router.delete(
    "/synonyms/:synonymId",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_SYNONYMS),
    controller.adminArchiveSynonym
  );

  router.get(
    "/buyer-phrases",
    requireAdminPermission(SEARCH_PERMISSIONS.VIEW_ADMIN),
    controller.adminListBuyerPhrases
  );
  router.post(
    "/buyer-phrases",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_PHRASE_MAPPINGS),
    controller.adminCreateBuyerPhrase
  );
  router.patch(
    "/buyer-phrases/:mappingId",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_PHRASE_MAPPINGS),
    controller.adminUpdateBuyerPhrase
  );
  router.delete(
    "/buyer-phrases/:mappingId",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_PHRASE_MAPPINGS),
    controller.adminArchiveBuyerPhrase
  );

  router.get(
    "/product-keywords",
    requireAdminPermission(SEARCH_PERMISSIONS.VIEW_ADMIN),
    controller.adminListKeywordMappings
  );
  router.post(
    "/product-keywords",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_KEYWORDS),
    controller.adminCreateKeywordMapping
  );
  router.patch(
    "/product-keywords/:mappingId",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_KEYWORDS),
    controller.adminUpdateKeywordMapping
  );
  router.delete(
    "/product-keywords/:mappingId",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_KEYWORDS),
    controller.adminArchiveKeywordMapping
  );

  router.get(
    "/redirects",
    requireAdminPermission(SEARCH_PERMISSIONS.VIEW_ADMIN),
    controller.adminListRedirects
  );
  router.post(
    "/redirects",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_REDIRECTS),
    controller.adminCreateRedirect
  );
  router.patch(
    "/redirects/:redirectId",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_REDIRECTS),
    controller.adminUpdateRedirect
  );
  router.delete(
    "/redirects/:redirectId",
    requireAdminPermission(SEARCH_PERMISSIONS.MANAGE_REDIRECTS),
    controller.adminArchiveRedirect
  );

  router.get(
    "/logs",
    requireAdminPermission(SEARCH_PERMISSIONS.VIEW_LOGS),
    controller.adminSearchLogs
  );
  router.get(
    "/zero-results",
    requireAdminPermission(SEARCH_PERMISSIONS.VIEW_LOGS),
    controller.adminZeroResultSearches
  );
  router.post(
    "/reindex",
    requireAdminPermission(SEARCH_PERMISSIONS.REINDEX),
    controller.adminReindexSearch
  );

  return router;
}

module.exports = { createSearchRouter, createAdminSearchRouter };
