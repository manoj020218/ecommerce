const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const {
  readSearchStore,
  writeSearchStore
} = require("../../database/search-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { toPublicProduct } = require("../products/products.model");
const {
  normalizeSearchText,
  tokenizeSearchText,
  sanitizeSearchSynonym,
  sanitizeBuyerPhraseMapping,
  sanitizeProductKeywordMapping,
  sanitizeSearchRedirect,
  sanitizeSearchLog,
  sanitizeUserSearchHistory,
  sanitizeUserViewHistory
} = require("./search.model");

function ensureSearchStoreShape(store) {
  if (!Array.isArray(store.searchSynonyms)) {
    store.searchSynonyms = [];
  }
  if (!Array.isArray(store.buyerPhraseMappings)) {
    store.buyerPhraseMappings = [];
  }
  if (!Array.isArray(store.productKeywordMappings)) {
    store.productKeywordMappings = [];
  }
  if (!Array.isArray(store.searchRedirects)) {
    store.searchRedirects = [];
  }
  if (!Array.isArray(store.searchLogs)) {
    store.searchLogs = [];
  }
  if (!Array.isArray(store.userSearchHistory)) {
    store.userSearchHistory = [];
  }
  if (!Array.isArray(store.userViewHistory)) {
    store.userViewHistory = [];
  }
  if (!Array.isArray(store.productSearchSignals)) {
    store.productSearchSignals = [];
  }
  if (!store.reindexMeta || typeof store.reindexMeta !== "object") {
    store.reindexMeta = {
      lastReindexedAt: null,
      indexedProductCount: 0,
      indexedActiveProductCount: 0,
      note: "Phase 5 search index metadata."
    };
  }
}

function buildSynonymLookup(synonymRows) {
  const lookup = new Map();

  for (const row of synonymRows) {
    if (!row.isActive) {
      continue;
    }

    const baseTerm = normalizeSearchText(row.term);
    if (!baseTerm) {
      continue;
    }

    const allTerms = new Set([baseTerm]);
    for (const synonym of row.synonyms || []) {
      const normalizedSynonym = normalizeSearchText(synonym);
      if (normalizedSynonym) {
        allTerms.add(normalizedSynonym);
      }
    }

    for (const term of allTerms) {
      if (!lookup.has(term)) {
        lookup.set(term, new Set());
      }
      const termSet = lookup.get(term);
      for (const alias of allTerms) {
        if (alias !== term) {
          termSet.add(alias);
        }
      }
    }
  }

  return lookup;
}

function buildKeywordMappingByProduct(keywordMappings) {
  const byProductId = new Map();

  for (const row of keywordMappings) {
    if (!row.isActive) {
      continue;
    }
    byProductId.set(row.productId, row);
  }

  return byProductId;
}

function buildProductSignalMap(signals) {
  const signalMap = new Map();

  for (const signal of signals) {
    signalMap.set(signal.productId, signal);
  }

  return signalMap;
}

function buildUserViewSet(userViewRows) {
  return new Set(userViewRows.map((row) => row.productId));
}

function buildSearchTextForProduct(product, categoryName, keywordMapping) {
  return normalizeSearchText(
    [
      product.title,
      product.slug,
      product.sku,
      product.modelNumber,
      product.brand,
      categoryName,
      product.shortDescription,
      product.fullDescription,
      ...(product.technicalKeywords || []),
      ...(product.customerKeywords || []),
      ...(product.useCases || []),
      ...(product.problemStatements || []),
      ...(keywordMapping?.keywords || []),
      ...(keywordMapping?.useCases || []),
      ...(keywordMapping?.problemStatements || [])
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function buildExpandedTerms(normalizedQuery, synonymLookup) {
  const expanded = new Set([normalizedQuery]);
  const tokens = tokenizeSearchText(normalizedQuery);
  tokens.forEach((token) => expanded.add(token));

  for (const term of [...expanded]) {
    const mapped = synonymLookup.get(term);
    if (mapped) {
      mapped.forEach((alias) => expanded.add(alias));
    }
  }

  return expanded;
}

function computeProductScore({
  product,
  normalizedQuery,
  queryTokens,
  expandedTerms,
  searchText,
  phraseBoost,
  signal,
  userViewedSet
}) {
  let score = 0;
  const reasons = [];

  const normalizedSku = normalizeSearchText(product.sku);
  const normalizedSlug = normalizeSearchText(product.slug);
  const normalizedTitle = normalizeSearchText(product.title);

  if (normalizedSku && normalizedSku === normalizedQuery) {
    score += 220;
    reasons.push("exact_sku");
  }

  if (normalizedSlug && normalizedSlug === normalizedQuery) {
    score += 190;
    reasons.push("exact_slug");
  }

  if (normalizedTitle && normalizedTitle === normalizedQuery) {
    score += 170;
    reasons.push("exact_title");
  }

  if (normalizedTitle && normalizedTitle.includes(normalizedQuery)) {
    score += 95;
    reasons.push("title_match");
  }

  if (searchText.includes(normalizedQuery)) {
    score += 45;
    reasons.push("text_match");
  }

  let tokenHitCount = 0;
  for (const term of expandedTerms) {
    if (term.length < 2) {
      continue;
    }
    if (searchText.includes(term)) {
      tokenHitCount += 1;
      score += term === normalizedQuery ? 0 : 12;
    }
  }

  if (tokenHitCount > 0) {
    reasons.push("expanded_terms");
  }

  if (queryTokens.length > 1) {
    const allTokensMatch = queryTokens.every((token) => searchText.includes(token));
    if (allTokensMatch) {
      score += 24;
      reasons.push("all_tokens_match");
    }
  }

  if (phraseBoost > 0) {
    score += phraseBoost;
    reasons.push("phrase_mapping");
  }

  const clickCount = Number(signal?.clickCount || 0);
  if (clickCount > 0) {
    score += Math.min(28, Math.log2(clickCount + 1) * 6);
    reasons.push("click_boost");
  }

  if (userViewedSet.has(product.id)) {
    score += 8;
    reasons.push("user_view_history");
  }

  return { score, reasons };
}

function createSearchResultEntry(product, scoreEntry) {
  return {
    id: product.id,
    score: Number(scoreEntry.score.toFixed(3)),
    reasons: scoreEntry.reasons,
    product: toPublicProduct(product)
  };
}

function resolveSearchRedirect(searchRedirects, normalizedQuery) {
  const redirect = searchRedirects.find(
    (row) =>
      row.isActive &&
      normalizeSearchText(row.fromQuery) === normalizedQuery
  );

  if (!redirect) {
    return null;
  }

  return {
    fromQuery: redirect.fromQuery,
    toType: redirect.toType,
    toValue: redirect.toValue
  };
}

function upsertUserSearchHistory(store, userId, normalizedQuery, rawQuery) {
  const index = store.userSearchHistory.findIndex(
    (row) => row.userId === userId && row.normalizedQuery === normalizedQuery
  );

  const now = new Date().toISOString();
  if (index < 0) {
    store.userSearchHistory.push({
      id: generateId("usr_search"),
      userId,
      query: rawQuery,
      normalizedQuery,
      searchCount: 1,
      lastSearchedAt: now
    });
    return;
  }

  store.userSearchHistory[index] = {
    ...store.userSearchHistory[index],
    query: rawQuery,
    searchCount: Number(store.userSearchHistory[index].searchCount || 0) + 1,
    lastSearchedAt: now
  };
}

function appendSearchLog(store, row) {
  store.searchLogs.push(row);
  if (store.searchLogs.length > 5000) {
    store.searchLogs = store.searchLogs.slice(-5000);
  }
}

function ensureProductIdsExist(productIds, catalogStore) {
  const productIdSet = new Set(catalogStore.products.map((product) => product.id));
  for (const productId of productIds) {
    if (!productIdSet.has(productId)) {
      throw new HttpError(400, `Invalid productId in mapping: ${productId}`);
    }
  }
}

async function performSearch(input) {
  const normalizedQuery = normalizeSearchText(input.q);
  const queryTokens = tokenizeSearchText(normalizedQuery);

  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  const redirect = resolveSearchRedirect(searchStore.searchRedirects, normalizedQuery);

  const activeProducts = catalogStore.products.filter((product) => product.isActive);
  const categoriesById = new Map(
    catalogStore.categories.map((category) => [category.id, category])
  );

  const synonymLookup = buildSynonymLookup(searchStore.searchSynonyms);
  const expandedTerms = buildExpandedTerms(normalizedQuery, synonymLookup);
  const keywordMapByProduct = buildKeywordMappingByProduct(
    searchStore.productKeywordMappings
  );
  const signalMap = buildProductSignalMap(searchStore.productSearchSignals);
  const userViewedSet = buildUserViewSet(
    input.customerId
      ? searchStore.userViewHistory.filter((row) => row.userId === input.customerId)
      : []
  );

  const phraseBoostByProduct = new Map();
  for (const mapping of searchStore.buyerPhraseMappings) {
    if (!mapping.isActive) {
      continue;
    }

    const normalizedPhrase = normalizeSearchText(mapping.phrase);
    if (!normalizedPhrase) {
      continue;
    }

    if (
      normalizedQuery.includes(normalizedPhrase) ||
      normalizedPhrase.includes(normalizedQuery)
    ) {
      for (const productId of mapping.productIds || []) {
        const currentBoost = Number(phraseBoostByProduct.get(productId) || 0);
        phraseBoostByProduct.set(productId, currentBoost + Number(mapping.weight || 0));
      }
    }
  }

  let results = [];
  if (!redirect) {
    results = activeProducts
      .map((product) => {
        const categoryName =
          categoriesById.get(product.categoryId || "")?.name || "";
        const keywordMapping = keywordMapByProduct.get(product.id);
        const searchText = buildSearchTextForProduct(
          product,
          categoryName,
          keywordMapping
        );

        const scoreEntry = computeProductScore({
          product,
          normalizedQuery,
          queryTokens,
          expandedTerms,
          searchText,
          phraseBoost: Number(phraseBoostByProduct.get(product.id) || 0),
          signal: signalMap.get(product.id),
          userViewedSet
        });

        if (scoreEntry.score <= 0) {
          return null;
        }

        return createSearchResultEntry(product, scoreEntry);
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        const aUpdatedAt = Date.parse(a.product.updatedAt || "");
        const bUpdatedAt = Date.parse(b.product.updatedAt || "");
        return bUpdatedAt - aUpdatedAt;
      })
      .slice(0, input.limit);
  }

  const searchLog = {
    id: generateId("search_log"),
    query: input.q,
    normalizedQuery,
    resultCount: results.length,
    topResultIds: results.slice(0, 10).map((entry) => entry.id),
    redirect: redirect ? { ...redirect } : null,
    customerId: input.customerId || null,
    sessionId: input.sessionId || "",
    createdAt: new Date().toISOString()
  };
  appendSearchLog(searchStore, searchLog);

  if (input.customerId) {
    upsertUserSearchHistory(searchStore, input.customerId, normalizedQuery, input.q);
  }

  await writeSearchStore(searchStore);

  return {
    query: input.q,
    normalizedQuery,
    redirect,
    resultCount: results.length,
    results
  };
}

async function suggestSearch(input) {
  const normalizedQuery = normalizeSearchText(input.q);
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  const activeProducts = catalogStore.products.filter((product) => product.isActive);
  const activeCategories = catalogStore.categories.filter((category) => category.isActive);

  const suggestions = new Set();
  if (normalizedQuery) {
    activeProducts.forEach((product) => {
      const title = String(product.title || "").trim();
      const normalizedTitle = normalizeSearchText(title);
      if (!normalizedTitle) {
        return;
      }
      if (normalizedTitle.startsWith(normalizedQuery)) {
        suggestions.add(title);
      }
    });

    activeCategories.forEach((category) => {
      const name = String(category.name || "").trim();
      const normalizedName = normalizeSearchText(name);
      if (normalizedName && normalizedName.includes(normalizedQuery)) {
        suggestions.add(name);
      }
    });

    searchStore.searchLogs.forEach((row) => {
      if (!row.normalizedQuery || row.resultCount <= 0) {
        return;
      }
      if (row.normalizedQuery.startsWith(normalizedQuery)) {
        suggestions.add(row.query);
      }
    });
  }

  const productMatches = activeProducts
    .filter((product) => {
      if (!normalizedQuery) {
        return false;
      }
      const text = normalizeSearchText(
        `${product.title} ${product.sku} ${product.modelNumber || ""} ${product.brand || ""}`
      );
      return text.includes(normalizedQuery);
    })
    .slice(0, input.limit)
    .map((product) => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      sku: product.sku
    }));

  const categoryMatches = activeCategories
    .filter((category) => {
      if (!normalizedQuery) {
        return false;
      }
      return normalizeSearchText(category.name).includes(normalizedQuery);
    })
    .slice(0, input.limit)
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug
    }));

  const customerId = input.customerId || null;
  const recentSearches = customerId
    ? searchStore.userSearchHistory
        .filter((row) => row.userId === customerId)
        .sort((a, b) => Date.parse(b.lastSearchedAt) - Date.parse(a.lastSearchedAt))
        .slice(0, input.limit)
        .map(sanitizeUserSearchHistory)
    : [];

  const viewedRows = customerId
    ? searchStore.userViewHistory
        .filter((row) => row.userId === customerId)
        .sort((a, b) => Date.parse(b.lastViewedAt) - Date.parse(a.lastViewedAt))
        .slice(0, input.limit)
    : [];

  const productById = new Map(activeProducts.map((product) => [product.id, product]));
  const recentlyViewed = viewedRows
    .map((row) => productById.get(row.productId))
    .filter(Boolean)
    .map((product) => ({
      id: product.id,
      title: product.title,
      slug: product.slug,
      sku: product.sku
    }));

  return {
    query: input.q,
    suggestions: [...suggestions].slice(0, input.limit),
    productMatches,
    categoryMatches,
    recentSearches,
    recentlyViewed
  };
}

async function trackSearchClick(input) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  const now = new Date().toISOString();
  const index = searchStore.productSearchSignals.findIndex(
    (row) => row.productId === input.productId
  );

  if (index < 0) {
    searchStore.productSearchSignals.push({
      id: generateId("search_signal"),
      productId: input.productId,
      clickCount: 1,
      lastClickedAt: now
    });
  } else {
    searchStore.productSearchSignals[index] = {
      ...searchStore.productSearchSignals[index],
      clickCount: Number(searchStore.productSearchSignals[index].clickCount || 0) + 1,
      lastClickedAt: now
    };
  }

  appendSearchLog(searchStore, {
    id: generateId("search_log"),
    query: input.query || "",
    normalizedQuery: normalizeSearchText(input.query || ""),
    resultCount: 0,
    topResultIds: [],
    redirect: null,
    customerId: input.customerId || null,
    sessionId: input.sessionId || "",
    eventType: "click",
    eventMetadata: {
      productId: input.productId,
      position: input.position,
      resultSource: input.resultSource
    },
    createdAt: now
  });

  await writeSearchStore(searchStore);
  return { tracked: true };
}

async function trackCustomerProductView(customerId, productId) {
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  const productExists = catalogStore.products.some(
    (product) => product.id === productId && product.isActive
  );
  if (!productExists) {
    throw new HttpError(404, "Product not found for view tracking.");
  }

  const now = new Date().toISOString();
  const index = searchStore.userViewHistory.findIndex(
    (row) => row.userId === customerId && row.productId === productId
  );

  if (index < 0) {
    searchStore.userViewHistory.push({
      id: generateId("usr_view"),
      userId: customerId,
      productId,
      viewCount: 1,
      lastViewedAt: now
    });
  } else {
    searchStore.userViewHistory[index] = {
      ...searchStore.userViewHistory[index],
      viewCount: Number(searchStore.userViewHistory[index].viewCount || 0) + 1,
      lastViewedAt: now
    };
  }

  await writeSearchStore(searchStore);
  return { tracked: true };
}

async function listCustomerSearchHistory(customerId, limit = 20) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  return searchStore.userSearchHistory
    .filter((row) => row.userId === customerId)
    .sort((a, b) => Date.parse(b.lastSearchedAt) - Date.parse(a.lastSearchedAt))
    .slice(0, limit)
    .map(sanitizeUserSearchHistory);
}

async function listCustomerViewedHistory(customerId, limit = 20) {
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  const productById = new Map(
    catalogStore.products
      .filter((product) => product.isActive)
      .map((product) => [product.id, product])
  );

  return searchStore.userViewHistory
    .filter((row) => row.userId === customerId)
    .sort((a, b) => Date.parse(b.lastViewedAt) - Date.parse(a.lastViewedAt))
    .slice(0, limit)
    .map((row) => {
      const product = productById.get(row.productId);
      return {
        ...sanitizeUserViewHistory(row),
        product: product
          ? {
              id: product.id,
              title: product.title,
              slug: product.slug,
              sku: product.sku
            }
          : null
      };
    })
    .filter((row) => row.product);
}

async function listSynonyms(filters) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  let rows = [...searchStore.searchSynonyms];
  if (!filters.includeInactive) {
    rows = rows.filter((row) => row.isActive);
  }

  if (filters.q) {
    const normalizedQuery = normalizeSearchText(filters.q);
    rows = rows.filter((row) => {
      const text = normalizeSearchText(
        `${row.term} ${(row.synonyms || []).join(" ")} ${row.language || ""}`
      );
      return text.includes(normalizedQuery);
    });
  }

  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows.slice(0, filters.limit).map(sanitizeSearchSynonym);
}

async function createSynonym(payload, actor) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  const normalizedTerm = normalizeSearchText(payload.term);
  const duplicate = searchStore.searchSynonyms.find(
    (row) => normalizeSearchText(row.term) === normalizedTerm
  );
  if (duplicate) {
    throw new HttpError(409, "Synonym term already exists.");
  }

  const now = new Date().toISOString();
  const row = {
    id: generateId("search_syn"),
    term: payload.term,
    synonyms: [...new Set(payload.synonyms)],
    language: payload.language,
    isActive: payload.isActive,
    createdAt: now,
    updatedAt: now
  };

  searchStore.searchSynonyms.push(row);
  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.synonym.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_synonym",
    resourceId: row.id
  });

  return sanitizeSearchSynonym(row);
}

async function updateSynonym(synonymId, patch, actor) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  const index = searchStore.searchSynonyms.findIndex((row) => row.id === synonymId);
  if (index < 0) {
    throw new HttpError(404, "Search synonym not found.");
  }

  const current = searchStore.searchSynonyms[index];
  const nextTerm = patch.term || current.term;
  const normalizedNextTerm = normalizeSearchText(nextTerm);
  const duplicate = searchStore.searchSynonyms.find(
    (row) =>
      row.id !== synonymId && normalizeSearchText(row.term) === normalizedNextTerm
  );
  if (duplicate) {
    throw new HttpError(409, "Synonym term already exists.");
  }

  const next = {
    ...current,
    ...patch,
    term: nextTerm,
    synonyms: patch.synonyms ? [...new Set(patch.synonyms)] : current.synonyms,
    updatedAt: new Date().toISOString()
  };

  searchStore.searchSynonyms[index] = next;
  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.synonym.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_synonym",
    resourceId: synonymId
  });

  return sanitizeSearchSynonym(next);
}

async function archiveSynonym(synonymId, actor) {
  return updateSynonym(synonymId, { isActive: false }, actor);
}

async function listBuyerPhraseMappings(filters) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  let rows = [...searchStore.buyerPhraseMappings];
  if (!filters.includeInactive) {
    rows = rows.filter((row) => row.isActive);
  }

  if (filters.q) {
    const normalizedQuery = normalizeSearchText(filters.q);
    rows = rows.filter((row) =>
      normalizeSearchText(`${row.phrase} ${row.notes || ""}`).includes(normalizedQuery)
    );
  }

  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows.slice(0, filters.limit).map(sanitizeBuyerPhraseMapping);
}

async function createBuyerPhraseMapping(payload, actor) {
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  ensureProductIdsExist(payload.productIds, catalogStore);

  const normalizedPhrase = normalizeSearchText(payload.phrase);
  const duplicate = searchStore.buyerPhraseMappings.find(
    (row) => normalizeSearchText(row.phrase) === normalizedPhrase
  );
  if (duplicate) {
    throw new HttpError(409, "Buyer phrase mapping already exists.");
  }

  const now = new Date().toISOString();
  const row = {
    id: generateId("search_phrase"),
    phrase: payload.phrase,
    productIds: [...new Set(payload.productIds)],
    weight: payload.weight,
    isActive: payload.isActive,
    notes: payload.notes,
    createdAt: now,
    updatedAt: now
  };

  searchStore.buyerPhraseMappings.push(row);
  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.phrase_mapping.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_phrase_mapping",
    resourceId: row.id
  });

  return sanitizeBuyerPhraseMapping(row);
}

async function updateBuyerPhraseMapping(mappingId, patch, actor) {
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  const index = searchStore.buyerPhraseMappings.findIndex((row) => row.id === mappingId);
  if (index < 0) {
    throw new HttpError(404, "Buyer phrase mapping not found.");
  }

  if (patch.productIds) {
    ensureProductIdsExist(patch.productIds, catalogStore);
  }

  const current = searchStore.buyerPhraseMappings[index];
  const nextPhrase = patch.phrase || current.phrase;
  const normalizedNextPhrase = normalizeSearchText(nextPhrase);
  const duplicate = searchStore.buyerPhraseMappings.find(
    (row) =>
      row.id !== mappingId && normalizeSearchText(row.phrase) === normalizedNextPhrase
  );
  if (duplicate) {
    throw new HttpError(409, "Buyer phrase mapping already exists.");
  }

  const next = {
    ...current,
    ...patch,
    phrase: nextPhrase,
    productIds: patch.productIds
      ? [...new Set(patch.productIds)]
      : current.productIds,
    updatedAt: new Date().toISOString()
  };

  searchStore.buyerPhraseMappings[index] = next;
  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.phrase_mapping.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_phrase_mapping",
    resourceId: mappingId
  });

  return sanitizeBuyerPhraseMapping(next);
}

async function archiveBuyerPhraseMapping(mappingId, actor) {
  return updateBuyerPhraseMapping(mappingId, { isActive: false }, actor);
}

async function listProductKeywordMappings(filters) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  let rows = [...searchStore.productKeywordMappings];
  if (!filters.includeInactive) {
    rows = rows.filter((row) => row.isActive);
  }

  if (filters.q) {
    const normalizedQuery = normalizeSearchText(filters.q);
    rows = rows.filter((row) => {
      const text = normalizeSearchText(
        `${row.productId} ${(row.keywords || []).join(" ")} ${(row.useCases || []).join(
          " "
        )} ${(row.problemStatements || []).join(" ")}`
      );
      return text.includes(normalizedQuery);
    });
  }

  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows.slice(0, filters.limit).map(sanitizeProductKeywordMapping);
}

async function createProductKeywordMapping(payload, actor) {
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  ensureProductIdsExist([payload.productId], catalogStore);

  const duplicate = searchStore.productKeywordMappings.find(
    (row) => row.productId === payload.productId
  );
  if (duplicate) {
    throw new HttpError(409, "Product keyword mapping already exists.");
  }

  const now = new Date().toISOString();
  const row = {
    id: generateId("search_kwmap"),
    productId: payload.productId,
    keywords: [...new Set(payload.keywords)],
    useCases: [...new Set(payload.useCases)],
    problemStatements: [...new Set(payload.problemStatements)],
    isActive: payload.isActive,
    createdAt: now,
    updatedAt: now
  };

  searchStore.productKeywordMappings.push(row);
  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.keyword_mapping.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_keyword_mapping",
    resourceId: row.id
  });

  return sanitizeProductKeywordMapping(row);
}

async function updateProductKeywordMapping(mappingId, patch, actor) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  const index = searchStore.productKeywordMappings.findIndex(
    (row) => row.id === mappingId
  );
  if (index < 0) {
    throw new HttpError(404, "Product keyword mapping not found.");
  }

  const current = searchStore.productKeywordMappings[index];
  const next = {
    ...current,
    ...patch,
    keywords: patch.keywords ? [...new Set(patch.keywords)] : current.keywords,
    useCases: patch.useCases ? [...new Set(patch.useCases)] : current.useCases,
    problemStatements: patch.problemStatements
      ? [...new Set(patch.problemStatements)]
      : current.problemStatements,
    updatedAt: new Date().toISOString()
  };

  searchStore.productKeywordMappings[index] = next;
  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.keyword_mapping.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_keyword_mapping",
    resourceId: mappingId
  });

  return sanitizeProductKeywordMapping(next);
}

async function archiveProductKeywordMapping(mappingId, actor) {
  return updateProductKeywordMapping(mappingId, { isActive: false }, actor);
}

async function listSearchRedirects(filters) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  let rows = [...searchStore.searchRedirects];
  if (!filters.includeInactive) {
    rows = rows.filter((row) => row.isActive);
  }

  if (filters.q) {
    const normalizedQuery = normalizeSearchText(filters.q);
    rows = rows.filter((row) =>
      normalizeSearchText(`${row.fromQuery} ${row.toType} ${row.toValue}`).includes(
        normalizedQuery
      )
    );
  }

  rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return rows.slice(0, filters.limit).map(sanitizeSearchRedirect);
}

async function createSearchRedirect(payload, actor) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  const normalizedFromQuery = normalizeSearchText(payload.fromQuery);
  const duplicate = searchStore.searchRedirects.find(
    (row) => normalizeSearchText(row.fromQuery) === normalizedFromQuery
  );
  if (duplicate) {
    throw new HttpError(409, "Search redirect already exists for query.");
  }

  const now = new Date().toISOString();
  const row = {
    id: generateId("search_redirect"),
    fromQuery: payload.fromQuery,
    toType: payload.toType,
    toValue: payload.toValue,
    isActive: payload.isActive,
    createdAt: now,
    updatedAt: now
  };

  searchStore.searchRedirects.push(row);
  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.redirect.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_redirect",
    resourceId: row.id
  });

  return sanitizeSearchRedirect(row);
}

async function updateSearchRedirect(redirectId, patch, actor) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  const index = searchStore.searchRedirects.findIndex((row) => row.id === redirectId);
  if (index < 0) {
    throw new HttpError(404, "Search redirect not found.");
  }

  const current = searchStore.searchRedirects[index];
  const nextFromQuery = patch.fromQuery || current.fromQuery;
  const normalizedNextQuery = normalizeSearchText(nextFromQuery);
  const duplicate = searchStore.searchRedirects.find(
    (row) =>
      row.id !== redirectId &&
      normalizeSearchText(row.fromQuery) === normalizedNextQuery
  );
  if (duplicate) {
    throw new HttpError(409, "Search redirect already exists for query.");
  }

  const next = {
    ...current,
    ...patch,
    fromQuery: nextFromQuery,
    updatedAt: new Date().toISOString()
  };

  searchStore.searchRedirects[index] = next;
  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.redirect.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_redirect",
    resourceId: redirectId
  });

  return sanitizeSearchRedirect(next);
}

async function archiveSearchRedirect(redirectId, actor) {
  return updateSearchRedirect(redirectId, { isActive: false }, actor);
}

async function listSearchLogs(filters) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  let rows = [...searchStore.searchLogs];

  if (filters.q) {
    const normalizedQuery = normalizeSearchText(filters.q);
    rows = rows.filter((row) =>
      normalizeSearchText(`${row.query} ${row.normalizedQuery}`).includes(
        normalizedQuery
      )
    );
  }

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows.slice(0, filters.limit).map(sanitizeSearchLog);
}

async function listZeroResultSearches(filters) {
  const searchStore = await readSearchStore();
  ensureSearchStoreShape(searchStore);

  const grouped = new Map();
  for (const row of searchStore.searchLogs) {
    if (row.eventType) {
      continue;
    }
    if (Number(row.resultCount || 0) !== 0) {
      continue;
    }
    if (!row.normalizedQuery) {
      continue;
    }

    if (!grouped.has(row.normalizedQuery)) {
      grouped.set(row.normalizedQuery, {
        query: row.query,
        normalizedQuery: row.normalizedQuery,
        count: 0,
        lastSearchedAt: row.createdAt
      });
    }

    const current = grouped.get(row.normalizedQuery);
    current.count += 1;
    if (row.createdAt > current.lastSearchedAt) {
      current.lastSearchedAt = row.createdAt;
      current.query = row.query;
    }
  }

  let rows = [...grouped.values()];
  if (filters.q) {
    const normalizedQuery = normalizeSearchText(filters.q);
    rows = rows.filter((row) => row.normalizedQuery.includes(normalizedQuery));
  }

  rows.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.lastSearchedAt.localeCompare(a.lastSearchedAt);
  });

  return rows.slice(0, filters.limit);
}

async function reindexSearch(actor) {
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  const indexedProductCount = catalogStore.products.length;
  const indexedActiveProductCount = catalogStore.products.filter(
    (product) => product.isActive
  ).length;

  searchStore.reindexMeta = {
    lastReindexedAt: new Date().toISOString(),
    indexedProductCount,
    indexedActiveProductCount,
    note: "Hybrid lexical index refreshed. Semantic/vector layer is TODO."
  };

  await writeSearchStore(searchStore);

  await addActivityLog({
    action: "search.reindex.triggered",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "search_index",
    metadata: {
      indexedProductCount,
      indexedActiveProductCount
    }
  });

  return { ...searchStore.reindexMeta };
}

async function getSearchAdminOverview() {
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);
  ensureSearchStoreShape(searchStore);

  return {
    productsIndexed: catalogStore.products.filter((row) => row.isActive).length,
    synonymsCount: searchStore.searchSynonyms.length,
    buyerPhraseMappingsCount: searchStore.buyerPhraseMappings.length,
    productKeywordMappingsCount: searchStore.productKeywordMappings.length,
    redirectsCount: searchStore.searchRedirects.length,
    searchLogsCount: searchStore.searchLogs.length,
    reindexMeta: { ...searchStore.reindexMeta }
  };
}

module.exports = {
  performSearch,
  suggestSearch,
  trackSearchClick,
  trackCustomerProductView,
  listCustomerSearchHistory,
  listCustomerViewedHistory,
  getSearchAdminOverview,
  listSynonyms,
  createSynonym,
  updateSynonym,
  archiveSynonym,
  listBuyerPhraseMappings,
  createBuyerPhraseMapping,
  updateBuyerPhraseMapping,
  archiveBuyerPhraseMapping,
  listProductKeywordMappings,
  createProductKeywordMapping,
  updateProductKeywordMapping,
  archiveProductKeywordMapping,
  listSearchRedirects,
  createSearchRedirect,
  updateSearchRedirect,
  archiveSearchRedirect,
  listSearchLogs,
  listZeroResultSearches,
  reindexSearch
};
