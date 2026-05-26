function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearchText(value) {
  return normalizeSearchText(value)
    .split(/[^a-z0-9\u0900-\u097f]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseMoney(value) {
  const numeric = Number(String(value || "").replace(/,/g, "").trim());
  if (Number.isNaN(numeric)) {
    return 0;
  }
  return numeric;
}

function sanitizeSearchSynonym(row) {
  return {
    ...row,
    synonyms: Array.isArray(row.synonyms) ? [...row.synonyms] : []
  };
}

function sanitizeBuyerPhraseMapping(row) {
  return {
    ...row,
    productIds: Array.isArray(row.productIds) ? [...row.productIds] : []
  };
}

function sanitizeProductKeywordMapping(row) {
  return {
    ...row,
    keywords: Array.isArray(row.keywords) ? [...row.keywords] : [],
    useCases: Array.isArray(row.useCases) ? [...row.useCases] : [],
    problemStatements: Array.isArray(row.problemStatements)
      ? [...row.problemStatements]
      : []
  };
}

function sanitizeSearchRedirect(row) {
  return { ...row };
}

function sanitizeSearchLog(row) {
  return {
    ...row,
    topResultIds: Array.isArray(row.topResultIds) ? [...row.topResultIds] : []
  };
}

function sanitizeUserSearchHistory(row) {
  return { ...row };
}

function sanitizeUserViewHistory(row) {
  return { ...row };
}

module.exports = {
  normalizeSearchText,
  tokenizeSearchText,
  parseMoney,
  sanitizeSearchSynonym,
  sanitizeBuyerPhraseMapping,
  sanitizeProductKeywordMapping,
  sanitizeSearchRedirect,
  sanitizeSearchLog,
  sanitizeUserSearchHistory,
  sanitizeUserViewHistory
};
