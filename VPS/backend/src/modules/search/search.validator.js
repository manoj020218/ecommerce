const { z } = require("zod");
const { HttpError } = require("../../common/http-error");

const searchTextSchema = z.string().trim().min(1).max(200);
const optionalSearchTextSchema = z.string().trim().max(200).optional().default("");
const limitSchema = z.coerce.number().int().min(1).max(100).optional().default(20);

const searchQuerySchema = z.object({
  q: searchTextSchema,
  limit: limitSchema,
  sessionId: z.string().trim().max(120).optional().default("")
});

const suggestQuerySchema = z.object({
  q: optionalSearchTextSchema,
  limit: z.coerce.number().int().min(1).max(20).optional().default(8)
});

const clickPayloadSchema = z.object({
  query: z.string().trim().max(200).optional().default(""),
  productId: z.string().trim().min(2).max(150),
  position: z.coerce.number().int().min(1).max(500).optional().default(1),
  resultSource: z.string().trim().max(120).optional().default("search_result")
});

const viewPayloadSchema = z.object({
  productId: z.string().trim().min(2).max(150)
});

const listAdminQuerySchema = z.object({
  q: optionalSearchTextSchema,
  includeInactive: z.coerce.boolean().optional().default(true),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100)
});

const synonymPayloadSchema = z.object({
  term: z.string().trim().min(2).max(120),
  synonyms: z.array(z.string().trim().min(2).max(120)).min(1).max(50),
  language: z.string().trim().max(30).optional().default("mixed"),
  isActive: z.boolean().optional().default(true)
});

const synonymPatchSchema = z.object({
  term: z.string().trim().min(2).max(120).optional(),
  synonyms: z.array(z.string().trim().min(2).max(120)).min(1).max(50).optional(),
  language: z.string().trim().max(30).optional(),
  isActive: z.boolean().optional()
});

const phrasePayloadSchema = z.object({
  phrase: z.string().trim().min(2).max(180),
  productIds: z.array(z.string().trim().min(2).max(150)).min(1).max(100),
  weight: z.coerce.number().int().min(1).max(100).optional().default(50),
  isActive: z.boolean().optional().default(true),
  notes: z.string().trim().max(500).optional().default("")
});

const phrasePatchSchema = z.object({
  phrase: z.string().trim().min(2).max(180).optional(),
  productIds: z.array(z.string().trim().min(2).max(150)).min(1).max(100).optional(),
  weight: z.coerce.number().int().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(500).optional()
});

const keywordPayloadSchema = z.object({
  productId: z.string().trim().min(2).max(150),
  keywords: z.array(z.string().trim().min(2).max(150)).optional().default([]),
  useCases: z.array(z.string().trim().min(2).max(200)).optional().default([]),
  problemStatements: z.array(z.string().trim().min(2).max(200)).optional().default([]),
  isActive: z.boolean().optional().default(true)
});

const keywordPatchSchema = z.object({
  keywords: z.array(z.string().trim().min(2).max(150)).optional(),
  useCases: z.array(z.string().trim().min(2).max(200)).optional(),
  problemStatements: z.array(z.string().trim().min(2).max(200)).optional(),
  isActive: z.boolean().optional()
});

const redirectPayloadSchema = z.object({
  fromQuery: z.string().trim().min(2).max(180),
  toType: z.enum(["product", "category", "url"]),
  toValue: z.string().trim().min(2).max(1000),
  isActive: z.boolean().optional().default(true)
});

const redirectPatchSchema = z.object({
  fromQuery: z.string().trim().min(2).max(180).optional(),
  toType: z.enum(["product", "category", "url"]).optional(),
  toValue: z.string().trim().min(2).max(1000).optional(),
  isActive: z.boolean().optional()
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseSearchQuery(query) {
  return searchQuerySchema.parse(query || {});
}

function parseSuggestQuery(query) {
  return suggestQuerySchema.parse(query || {});
}

function parseClickPayload(payload) {
  ensureObject(payload, "Search click");
  return clickPayloadSchema.parse(payload);
}

function parseViewPayload(payload) {
  ensureObject(payload, "Search view");
  return viewPayloadSchema.parse(payload);
}

function parseListAdminQuery(query) {
  return listAdminQuerySchema.parse(query || {});
}

function parseSynonymPayload(payload) {
  ensureObject(payload, "Search synonym");
  return synonymPayloadSchema.parse(payload);
}

function parseSynonymPatch(payload) {
  ensureObject(payload, "Search synonym update");
  return synonymPatchSchema.parse(payload);
}

function parsePhrasePayload(payload) {
  ensureObject(payload, "Buyer phrase mapping");
  return phrasePayloadSchema.parse(payload);
}

function parsePhrasePatch(payload) {
  ensureObject(payload, "Buyer phrase mapping update");
  return phrasePatchSchema.parse(payload);
}

function parseKeywordPayload(payload) {
  ensureObject(payload, "Product keyword mapping");
  return keywordPayloadSchema.parse(payload);
}

function parseKeywordPatch(payload) {
  ensureObject(payload, "Product keyword mapping update");
  return keywordPatchSchema.parse(payload);
}

function parseRedirectPayload(payload) {
  ensureObject(payload, "Search redirect");
  return redirectPayloadSchema.parse(payload);
}

function parseRedirectPatch(payload) {
  ensureObject(payload, "Search redirect update");
  return redirectPatchSchema.parse(payload);
}

module.exports = {
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
};
