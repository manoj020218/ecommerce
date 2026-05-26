const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./search.service");
const {
  parseSearchQuery,
  parseSuggestQuery,
  parseClickPayload,
  parseViewPayload,
  parseListAdminQuery,
  parseSynonymPayload,
  parseSynonymPatch,
  parsePhrasePayload,
  parsePhrasePatch,
  parseKeywordPayload,
  parseKeywordPatch,
  parseRedirectPayload,
  parseRedirectPatch
} = require("./search.validator");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    return new HttpError(400, "Validation failed.", { issues: error.issues });
  }
  return error;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(mapValidationError(error));
    }
  };
}

const publicSearch = asyncHandler(async (req, res) => {
  const query = parseSearchQuery(req.query || {});
  const data = await service.performSearch({
    q: query.q,
    limit: query.limit,
    sessionId: query.sessionId,
    customerId: req.customer?.id || null
  });
  return ok(res, data, "Search results fetched.");
});

const publicSuggest = asyncHandler(async (req, res) => {
  const query = parseSuggestQuery(req.query || {});
  const data = await service.suggestSearch({
    q: query.q,
    limit: query.limit,
    customerId: req.customer?.id || null
  });
  return ok(res, data, "Search suggestions fetched.");
});

const publicTrackSearchClick = asyncHandler(async (req, res) => {
  const payload = parseClickPayload(req.body);
  const data = await service.trackSearchClick({
    ...payload,
    customerId: req.customer?.id || null
  });
  return created(res, data, "Search click tracked.");
});

const customerTrackSearchView = asyncHandler(async (req, res) => {
  const payload = parseViewPayload(req.body);
  const data = await service.trackCustomerProductView(req.customer.id, payload.productId);
  return created(res, data, "Product view tracked.");
});

const customerSearchHistory = asyncHandler(async (req, res) => {
  const query = parseListAdminQuery(req.query || {});
  const data = await service.listCustomerSearchHistory(req.customer.id, query.limit);
  return ok(res, data, "Customer search history fetched.");
});

const customerViewedHistory = asyncHandler(async (req, res) => {
  const query = parseListAdminQuery(req.query || {});
  const data = await service.listCustomerViewedHistory(req.customer.id, query.limit);
  return ok(res, data, "Customer viewed product history fetched.");
});

const adminSearchOverview = asyncHandler(async (_req, res) => {
  const data = await service.getSearchAdminOverview();
  return ok(res, data, "Search admin overview fetched.");
});

const adminListSynonyms = asyncHandler(async (req, res) => {
  const query = parseListAdminQuery(req.query || {});
  const data = await service.listSynonyms(query);
  return ok(res, data, "Search synonyms fetched.");
});

const adminCreateSynonym = asyncHandler(async (req, res) => {
  const payload = parseSynonymPayload(req.body);
  const data = await service.createSynonym(payload, req.actor);
  return created(res, data, "Search synonym created.");
});

const adminUpdateSynonym = asyncHandler(async (req, res) => {
  const patch = parseSynonymPatch(req.body);
  const data = await service.updateSynonym(req.params.synonymId, patch, req.actor);
  return ok(res, data, "Search synonym updated.");
});

const adminArchiveSynonym = asyncHandler(async (req, res) => {
  const data = await service.archiveSynonym(req.params.synonymId, req.actor);
  return ok(res, data, "Search synonym archived.");
});

const adminListBuyerPhrases = asyncHandler(async (req, res) => {
  const query = parseListAdminQuery(req.query || {});
  const data = await service.listBuyerPhraseMappings(query);
  return ok(res, data, "Buyer phrase mappings fetched.");
});

const adminCreateBuyerPhrase = asyncHandler(async (req, res) => {
  const payload = parsePhrasePayload(req.body);
  const data = await service.createBuyerPhraseMapping(payload, req.actor);
  return created(res, data, "Buyer phrase mapping created.");
});

const adminUpdateBuyerPhrase = asyncHandler(async (req, res) => {
  const patch = parsePhrasePatch(req.body);
  const data = await service.updateBuyerPhraseMapping(
    req.params.mappingId,
    patch,
    req.actor
  );
  return ok(res, data, "Buyer phrase mapping updated.");
});

const adminArchiveBuyerPhrase = asyncHandler(async (req, res) => {
  const data = await service.archiveBuyerPhraseMapping(req.params.mappingId, req.actor);
  return ok(res, data, "Buyer phrase mapping archived.");
});

const adminListKeywordMappings = asyncHandler(async (req, res) => {
  const query = parseListAdminQuery(req.query || {});
  const data = await service.listProductKeywordMappings(query);
  return ok(res, data, "Product keyword mappings fetched.");
});

const adminCreateKeywordMapping = asyncHandler(async (req, res) => {
  const payload = parseKeywordPayload(req.body);
  const data = await service.createProductKeywordMapping(payload, req.actor);
  return created(res, data, "Product keyword mapping created.");
});

const adminUpdateKeywordMapping = asyncHandler(async (req, res) => {
  const patch = parseKeywordPatch(req.body);
  const data = await service.updateProductKeywordMapping(
    req.params.mappingId,
    patch,
    req.actor
  );
  return ok(res, data, "Product keyword mapping updated.");
});

const adminArchiveKeywordMapping = asyncHandler(async (req, res) => {
  const data = await service.archiveProductKeywordMapping(req.params.mappingId, req.actor);
  return ok(res, data, "Product keyword mapping archived.");
});

const adminListRedirects = asyncHandler(async (req, res) => {
  const query = parseListAdminQuery(req.query || {});
  const data = await service.listSearchRedirects(query);
  return ok(res, data, "Search redirects fetched.");
});

const adminCreateRedirect = asyncHandler(async (req, res) => {
  const payload = parseRedirectPayload(req.body);
  const data = await service.createSearchRedirect(payload, req.actor);
  return created(res, data, "Search redirect created.");
});

const adminUpdateRedirect = asyncHandler(async (req, res) => {
  const patch = parseRedirectPatch(req.body);
  const data = await service.updateSearchRedirect(req.params.redirectId, patch, req.actor);
  return ok(res, data, "Search redirect updated.");
});

const adminArchiveRedirect = asyncHandler(async (req, res) => {
  const data = await service.archiveSearchRedirect(req.params.redirectId, req.actor);
  return ok(res, data, "Search redirect archived.");
});

const adminSearchLogs = asyncHandler(async (req, res) => {
  const query = parseListAdminQuery(req.query || {});
  const data = await service.listSearchLogs(query);
  return ok(res, data, "Search logs fetched.");
});

const adminZeroResultSearches = asyncHandler(async (req, res) => {
  const query = parseListAdminQuery(req.query || {});
  const data = await service.listZeroResultSearches(query);
  return ok(res, data, "Zero-result searches fetched.");
});

const adminReindexSearch = asyncHandler(async (req, res) => {
  const data = await service.reindexSearch(req.actor);
  return ok(res, data, "Search reindex completed.");
});

module.exports = {
  publicSearch,
  publicSuggest,
  publicTrackSearchClick,
  customerTrackSearchView,
  customerSearchHistory,
  customerViewedHistory,
  adminSearchOverview,
  adminListSynonyms,
  adminCreateSynonym,
  adminUpdateSynonym,
  adminArchiveSynonym,
  adminListBuyerPhrases,
  adminCreateBuyerPhrase,
  adminUpdateBuyerPhrase,
  adminArchiveBuyerPhrase,
  adminListKeywordMappings,
  adminCreateKeywordMapping,
  adminUpdateKeywordMapping,
  adminArchiveKeywordMapping,
  adminListRedirects,
  adminCreateRedirect,
  adminUpdateRedirect,
  adminArchiveRedirect,
  adminSearchLogs,
  adminZeroResultSearches,
  adminReindexSearch
};
