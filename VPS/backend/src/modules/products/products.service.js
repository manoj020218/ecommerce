const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { readShippingStore } = require("../../database/shipping-store");
const { readSearchStore } = require("../../database/search-store");
const {
  createShippingProvider
} = require("../../integrations/shipping-providers/shipping-provider.adapter");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { listHelpfulGuidesForProduct } = require("../blogs/blogs.service");
const { buildProductPageSeoPayload } = require("../seo/seo.service");
const { trackCustomerProductView } = require("../search/search.service");
const { SHIPPING_METHODS } = require("../shipping/shipping.model");
const {
  PRODUCT_RELATION_TYPES,
  calculateAvailableQty,
  createEmptyProductRelations,
  sanitizeProductRelations,
  sanitizeAdminProduct,
  toPublicProduct,
  toPublicProductCard
} = require("./products.model");

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeHsnCode(value) {
  return value.trim().toUpperCase();
}

function normalizeBulkPriceSlabs(slabs) {
  return [...slabs]
    .map((slab) => ({
      minQty: Number(slab.minQty),
      unitPrice: Number(slab.unitPrice)
    }))
    .sort((a, b) => a.minQty - b.minQty);
}

function normalizeKeyFeatures(features) {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function normalizeDownloads(downloads) {
  if (!Array.isArray(downloads)) {
    return [];
  }

  return downloads
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      title: String(row.title || "").trim(),
      url: String(row.url || "").trim()
    }))
    .filter((row) => row.title && row.url);
}

function normalizeProductRelationsForStore(
  store,
  payloadRelations,
  currentProductId,
  fallbackRelations = createEmptyProductRelations()
) {
  const normalized = sanitizeProductRelations(fallbackRelations);
  const input = payloadRelations || {};

  for (const relationType of PRODUCT_RELATION_TYPES) {
    const maybeList = input[relationType];
    if (maybeList === undefined) {
      continue;
    }

    const deduped = [...new Set(maybeList.filter(Boolean).map((value) => String(value)))];
    for (const relatedProductId of deduped) {
      if (relatedProductId === currentProductId) {
        throw new HttpError(400, "A product cannot relate to itself.");
      }

      const referenced = store.products.find((product) => product.id === relatedProductId);
      if (!referenced) {
        throw new HttpError(
          400,
          `Invalid product reference in relation '${relationType}'.`
        );
      }
    }

    normalized[relationType] = deduped;
  }

  return normalized;
}

function generateSku(store) {
  const existing = new Set(store.products.map((product) => product.sku));
  let counter = store.products.length + 1;
  while (true) {
    const sku = `JNX-${String(counter).padStart(6, "0")}`;
    if (!existing.has(sku)) {
      return sku;
    }
    counter += 1;
  }
}

function ensureUniqueSlugAndSku(store, slug, sku, ignoreProductId = null) {
  const duplicate = store.products.find(
    (product) =>
      product.id !== ignoreProductId && (product.slug === slug || product.sku === sku)
  );
  if (duplicate) {
    throw new HttpError(409, "Product slug or SKU already exists.");
  }
}

function ensureCategoryExists(store, categoryId, label) {
  if (!categoryId) {
    return;
  }

  const category = store.categories.find((row) => row.id === categoryId);
  if (!category) {
    throw new HttpError(400, `Invalid ${label}.`);
  }
}

function resolveHsnRecord(store, hsnCode) {
  const normalized = normalizeHsnCode(hsnCode);
  const record = store.hsnTaxMaster.find((row) => row.hsnCode === normalized);
  if (!record) {
    throw new HttpError(400, "Invalid hsnCode.");
  }
  return record;
}

function publicBaseUploadUrl(filePath) {
  const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);
  const relativePath = path.relative(uploadsRoot, filePath).replace(/\\/g, "/");
  return `${env.publicBaseUrl}/static/uploads/${relativePath}`;
}

function buildProductSearchText(product) {
  return [
    product.title,
    product.slug,
    product.sku,
    product.modelNumber,
    product.brand,
    ...(product.customerKeywords || []),
    ...(product.technicalKeywords || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filterProducts(products, filters) {
  let rows = [...products];

  if (filters.categoryId) {
    rows = rows.filter(
      (product) => (product.categoryId || null) === filters.categoryId
    );
  }

  if (filters.q) {
    const query = filters.q.toLowerCase();
    rows = rows.filter((product) => buildProductSearchText(product).includes(query));
  }

  return rows;
}

function sortProducts(products) {
  return [...products].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function findActiveProductBySlug(store, slug) {
  return store.products.find((product) => product.slug === slug && product.isActive);
}

function buildBreadcrumb(store, product) {
  const byId = new Map(store.categories.map((category) => [category.id, category]));
  const crumbs = [{ label: "Home", href: "/" }];

  const primaryCategory =
    byId.get(product.subcategoryId || "") || byId.get(product.categoryId || "");
  if (primaryCategory) {
    const parent = primaryCategory.parentCategoryId
      ? byId.get(primaryCategory.parentCategoryId)
      : null;
    if (parent) {
      crumbs.push({
        label: parent.name,
        href: `/categories/${parent.slug}`
      });
    }
    crumbs.push({
      label: primaryCategory.name,
      href: `/categories/${primaryCategory.slug}`
    });
  }

  crumbs.push({
    label: product.title,
    href: `/products/${product.slug}`
  });

  return crumbs;
}

function buildRelatedGroupCards(productById, relationIds, options) {
  const rows = [];
  for (const productId of relationIds) {
    if (rows.length >= options.limit) {
      break;
    }

    const product = productById.get(productId);
    if (!product || !product.isActive || !product.slug) {
      continue;
    }

    rows.push(toPublicProductCard(product));
  }

  return rows;
}

function buildTopClickedCards(productById, searchStore, options, excludeProductId) {
  const rows = [];

  const sortedSignals = Array.isArray(searchStore.productSearchSignals)
    ? [...searchStore.productSearchSignals].sort(
        (a, b) => Number(b.clickCount || 0) - Number(a.clickCount || 0)
      )
    : [];

  for (const signal of sortedSignals) {
    if (rows.length >= options.limit) {
      break;
    }

    if (signal.productId === excludeProductId) {
      continue;
    }

    const product = productById.get(signal.productId);
    if (!product || !product.isActive) {
      continue;
    }

    rows.push({
      ...toPublicProductCard(product),
      score: Number(signal.clickCount || 0)
    });
  }

  return rows;
}

function buildTopViewedCards(productById, searchStore, options, excludeProductId) {
  const rows = [];
  const scoreMap = new Map();

  const historyRows = Array.isArray(searchStore.userViewHistory)
    ? searchStore.userViewHistory
    : [];

  for (const row of historyRows) {
    if (!row?.productId) {
      continue;
    }
    const current = Number(scoreMap.get(row.productId) || 0);
    scoreMap.set(row.productId, current + Number(row.viewCount || 0));
  }

  const sorted = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
  for (const [productId, score] of sorted) {
    if (rows.length >= options.limit) {
      break;
    }
    if (productId === excludeProductId) {
      continue;
    }

    const product = productById.get(productId);
    if (!product || !product.isActive) {
      continue;
    }

    rows.push({
      ...toPublicProductCard(product),
      score
    });
  }

  return rows;
}

function buildRecentSearches(searchStore, customerId, limit) {
  if (!customerId) {
    return [];
  }

  const rows = Array.isArray(searchStore.userSearchHistory)
    ? searchStore.userSearchHistory
    : [];

  return rows
    .filter((row) => row.userId === customerId)
    .sort((a, b) => Date.parse(b.lastSearchedAt) - Date.parse(a.lastSearchedAt))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      query: row.query,
      normalizedQuery: row.normalizedQuery,
      searchCount: Number(row.searchCount || 0),
      lastSearchedAt: row.lastSearchedAt
    }));
}

function buildRecentViewedCards(searchStore, productById, customerId, limit) {
  if (!customerId) {
    return [];
  }

  const rows = Array.isArray(searchStore.userViewHistory) ? searchStore.userViewHistory : [];

  return rows
    .filter((row) => row.userId === customerId)
    .sort((a, b) => Date.parse(b.lastViewedAt) - Date.parse(a.lastViewedAt))
    .slice(0, limit)
    .map((row) => {
      const product = productById.get(row.productId);
      if (!product || !product.isActive) {
        return null;
      }
      return {
        ...toPublicProductCard(product),
        viewCount: Number(row.viewCount || 0),
        lastViewedAt: row.lastViewedAt
      };
    })
    .filter(Boolean);
}

function buildRecommendationGroups(product, productById, searchStore, options) {
  const relations = sanitizeProductRelations(product.relations);

  return {
    related: buildRelatedGroupCards(productById, relations.related, options),
    accessories: buildRelatedGroupCards(productById, relations.accessory, options),
    requiredWith: buildRelatedGroupCards(productById, relations.required_with, options),
    spareParts: buildRelatedGroupCards(productById, relations.spare_part, options),
    similar: buildRelatedGroupCards(productById, relations.similar, options),
    upgrades: buildRelatedGroupCards(productById, relations.upgrade, options),
    frequentlyBoughtTogether: buildRelatedGroupCards(
      productById,
      relations.frequently_bought_together,
      options
    ),
    topSearched: buildTopClickedCards(productById, searchStore, options, product.id),
    mostVisited: buildTopViewedCards(productById, searchStore, options, product.id)
  };
}

function createProductRecordFromPayload(store, payload) {
  const hsn = resolveHsnRecord(store, payload.hsnCode);
  ensureCategoryExists(store, payload.categoryId || null, "categoryId");
  ensureCategoryExists(store, payload.subcategoryId || null, "subcategoryId");

  const slug = payload.slug ? slugify(payload.slug) : slugify(payload.title);
  const sku = generateSku(store);

  ensureUniqueSlugAndSku(store, slug, sku);

  const now = new Date().toISOString();
  const basePrice = Number(payload.basePrice);
  const salePrice =
    payload.salePrice === undefined || payload.salePrice === null
      ? basePrice
      : Number(payload.salePrice);
  if (salePrice > basePrice) {
    throw new HttpError(400, "salePrice cannot be greater than basePrice.");
  }
  const productId = generateId("prd");

  return {
    id: productId,
    title: payload.title,
    slug,
    sku,
    oldUrl: payload.oldUrl || "",
    categoryId: payload.categoryId || null,
    subcategoryId: payload.subcategoryId || null,
    brand: payload.brand || "",
    modelNumber: payload.modelNumber || "",
    mpn: payload.mpn || "",
    gtin: payload.gtin || "",
    hsnCode: hsn.hsnCode,
    gstRate: hsn.gstRate,
    basePrice,
    salePrice,
    images: [],
    shortDescription: payload.shortDescription || "",
    fullDescription: payload.fullDescription || "",
    keyFeatures: normalizeKeyFeatures(payload.keyFeatures || []),
    specifications: payload.specifications || {},
    downloads: normalizeDownloads(payload.downloads || []),
    technicalKeywords: payload.technicalKeywords || [],
    customerKeywords: payload.customerKeywords || [],
    useCases: payload.useCases || [],
    problemStatements: payload.problemStatements || [],
    relations: normalizeProductRelationsForStore(
      store,
      payload.relations || {},
      productId,
      createEmptyProductRelations()
    ),
    moq: Number(payload.moq || 1),
    bulkPricingEnabled: Boolean(payload.bulkPricingEnabled),
    bulkPriceSlabs: normalizeBulkPriceSlabs(payload.bulkPriceSlabs || []),
    quoteRequiredAboveQty:
      payload.quoteRequiredAboveQty === null ||
      payload.quoteRequiredAboveQty === undefined
        ? null
        : Number(payload.quoteRequiredAboveQty),
    deadWeightKg: Number(payload.deadWeightKg || 0),
    lengthCm:
      payload.lengthCm === null || payload.lengthCm === undefined
        ? null
        : Number(payload.lengthCm),
    widthCm:
      payload.widthCm === null || payload.widthCm === undefined
        ? null
        : Number(payload.widthCm),
    heightCm:
      payload.heightCm === null || payload.heightCm === undefined
        ? null
        : Number(payload.heightCm),
    shippingClass: payload.shippingClass || "normal",
    googleShoppingTitle: payload.googleShoppingTitle || "",
    googleShoppingDescription: payload.googleShoppingDescription || "",
    googleProductCategory: payload.googleProductCategory || "",
    productType: payload.productType || "",
    stockQty: Number(payload.stockQty || 0),
    reservedQty: Number(payload.reservedQty || 0),
    stockStatus: payload.stockStatus || "in_stock",
    stockVisibility: "hide_quantity",
    allowBackorder: Boolean(payload.allowBackorder),
    maxOrderQty: Number(payload.maxOrderQty || 1000),
    lowStockThreshold: Number(payload.lowStockThreshold || 0),
    isActive: Boolean(payload.isActive),
    createdAt: now,
    updatedAt: now
  };
}

async function listAdminProducts(filters) {
  const store = await readCatalogStore();
  let rows = [...store.products];

  if (!filters.includeInactive) {
    rows = rows.filter((product) => product.isActive);
  }

  rows = filterProducts(rows, filters);

  return sortProducts(rows).map(sanitizeAdminProduct);
}

async function getAdminProductById(productId) {
  const store = await readCatalogStore();
  const row = store.products.find((product) => product.id === productId);
  if (!row) {
    throw new HttpError(404, "Product not found.");
  }
  return sanitizeAdminProduct(row);
}

async function createProduct(payload, actor) {
  const store = await readCatalogStore();
  const product = createProductRecordFromPayload(store, payload);

  store.products.push(product);
  await writeCatalogStore(store);

  await addActivityLog({
    action: "products.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "product",
    resourceId: product.id
  });

  return sanitizeAdminProduct(product);
}

async function updateProduct(productId, patch, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((product) => product.id === productId);
  if (index < 0) {
    throw new HttpError(404, "Product not found.");
  }

  const current = store.products[index];

  const nextTitle = patch.title || current.title;
  const nextSlug = patch.slug ? slugify(patch.slug) : current.slug;
  const nextSku = current.sku;

  ensureUniqueSlugAndSku(store, nextSlug, nextSku, productId);

  const nextCategoryId =
    patch.categoryId === undefined ? current.categoryId : patch.categoryId || null;
  const nextSubcategoryId =
    patch.subcategoryId === undefined
      ? current.subcategoryId
      : patch.subcategoryId || null;

  ensureCategoryExists(store, nextCategoryId, "categoryId");
  ensureCategoryExists(store, nextSubcategoryId, "subcategoryId");

  const nextBasePrice =
    patch.basePrice === undefined ? Number(current.basePrice) : Number(patch.basePrice);
  const nextSalePrice =
    patch.salePrice === undefined ? Number(current.salePrice) : Number(patch.salePrice);
  if (nextSalePrice > nextBasePrice) {
    throw new HttpError(400, "salePrice cannot be greater than basePrice.");
  }

  const nextHsnCode = patch.hsnCode ? normalizeHsnCode(patch.hsnCode) : current.hsnCode;
  const hsn = resolveHsnRecord(store, nextHsnCode);
  const nextRelations =
    patch.relations === undefined
      ? sanitizeProductRelations(current.relations)
      : normalizeProductRelationsForStore(store, patch.relations, current.id, current.relations);

  const next = {
    ...current,
    ...patch,
    title: nextTitle,
    slug: nextSlug,
    categoryId: nextCategoryId,
    subcategoryId: nextSubcategoryId,
    basePrice: nextBasePrice,
    salePrice: nextSalePrice,
    hsnCode: hsn.hsnCode,
    gstRate: hsn.gstRate,
    keyFeatures:
      patch.keyFeatures === undefined
        ? normalizeKeyFeatures(current.keyFeatures || [])
        : normalizeKeyFeatures(patch.keyFeatures || []),
    downloads:
      patch.downloads === undefined
        ? normalizeDownloads(current.downloads || [])
        : normalizeDownloads(patch.downloads || []),
    relations: nextRelations,
    bulkPriceSlabs:
      patch.bulkPriceSlabs === undefined
        ? current.bulkPriceSlabs
        : normalizeBulkPriceSlabs(patch.bulkPriceSlabs),
    quoteRequiredAboveQty:
      patch.quoteRequiredAboveQty === undefined
        ? current.quoteRequiredAboveQty
        : patch.quoteRequiredAboveQty === null
          ? null
          : Number(patch.quoteRequiredAboveQty),
    updatedAt: new Date().toISOString()
  };

  store.products[index] = next;
  await writeCatalogStore(store);

  await addActivityLog({
    action: "products.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "product",
    resourceId: next.id,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return sanitizeAdminProduct(next);
}

async function archiveProduct(productId, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((product) => product.id === productId);
  if (index < 0) {
    throw new HttpError(404, "Product not found.");
  }

  store.products[index] = {
    ...store.products[index],
    isActive: false,
    updatedAt: new Date().toISOString()
  };
  await writeCatalogStore(store);

  await addActivityLog({
    action: "products.archived",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "product",
    resourceId: productId
  });

  return sanitizeAdminProduct(store.products[index]);
}

async function addProductImage(productId, filePath, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((product) => product.id === productId);
  if (index < 0) {
    throw new HttpError(404, "Product not found.");
  }

  const imageUrl = publicBaseUploadUrl(filePath);
  const currentImages = Array.isArray(store.products[index].images)
    ? [...store.products[index].images]
    : [];
  currentImages.push(imageUrl);

  store.products[index] = {
    ...store.products[index],
    images: currentImages,
    updatedAt: new Date().toISOString()
  };

  await writeCatalogStore(store);

  await addActivityLog({
    action: "products.image.uploaded",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "product",
    resourceId: productId,
    metadata: {
      imageUrl
    }
  });

  return {
    productId,
    imageUrl,
    imageCount: currentImages.length
  };
}

async function updateProductRelations(productId, relationsPatch, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((product) => product.id === productId);
  if (index < 0) {
    throw new HttpError(404, "Product not found.");
  }

  const current = store.products[index];
  const nextRelations = normalizeProductRelationsForStore(
    store,
    relationsPatch,
    current.id,
    current.relations
  );

  const next = {
    ...current,
    relations: nextRelations,
    updatedAt: new Date().toISOString()
  };

  store.products[index] = next;
  await writeCatalogStore(store);

  await addActivityLog({
    action: "products.relations.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "product",
    resourceId: productId,
    metadata: {
      relationTypesUpdated: Object.keys(relationsPatch)
    }
  });

  return sanitizeAdminProduct(next);
}

async function listPublicProducts(filters) {
  const store = await readCatalogStore();
  let rows = store.products.filter((product) => product.isActive);
  rows = filterProducts(rows, filters);
  return sortProducts(rows).map(toPublicProduct);
}

async function getPublicProductBySlug(slug) {
  const store = await readCatalogStore();
  const row = findActiveProductBySlug(store, slug);
  if (!row) {
    throw new HttpError(404, "Product not found.");
  }
  return toPublicProduct(row);
}

async function getPublicProductRecommendations(slug, options) {
  const [catalogStore, searchStore] = await Promise.all([
    readCatalogStore(),
    readSearchStore()
  ]);

  const product = findActiveProductBySlug(catalogStore, slug);
  if (!product) {
    throw new HttpError(404, "Product not found.");
  }

  const activeProducts = catalogStore.products.filter((row) => row.isActive);
  const productById = new Map(activeProducts.map((row) => [row.id, row]));

  const recommendationGroups = buildRecommendationGroups(
    product,
    productById,
    searchStore,
    {
      limit: options.limitPerGroup
    }
  );

  const recently = {
    searches: buildRecentSearches(searchStore, options.customerId, options.historyLimit),
    viewedProducts: buildRecentViewedCards(
      searchStore,
      productById,
      options.customerId,
      options.historyLimit
    )
  };

  const guides = await listHelpfulGuidesForProduct(product, Math.min(options.limitPerGroup, 6));

  return {
    productId: product.id,
    productSlug: product.slug,
    recommendationGroups,
    recently,
    guides
  };
}

async function getPublicProductPage(slug, options) {
  const store = await readCatalogStore();
  const product = findActiveProductBySlug(store, slug);

  if (!product) {
    throw new HttpError(404, "Product not found.");
  }

  if (options.customerId) {
    await trackCustomerProductView(options.customerId, product.id);
  }

  const recommendations = await getPublicProductRecommendations(slug, options);
  const breadcrumb = buildBreadcrumb(store, product);
  const publicProduct = toPublicProduct(product);
  const seoPayload = await buildProductPageSeoPayload(product, breadcrumb);

  return {
    breadcrumb,
    product: publicProduct,
    sectionsOrder: [
      "breadcrumb",
      "gallery",
      "title",
      "pricing",
      "moq_bulk_pricing",
      "availability",
      "gst_note",
      "quantity_selector",
      "primary_cta",
      "shipping_estimator",
      "key_features",
      "description",
      "specifications",
      "downloads",
      "recently_searched_or_viewed",
      "related_products",
      "frequently_bought_or_accessories",
      "top_searched_or_most_visited",
      "helpful_guides"
    ],
    recommendations,
    seo: seoPayload.seo,
    structuredData: seoPayload.structuredData
  };
}

async function estimateProductShipping(slug, input) {
  const [store, shippingStore] = await Promise.all([
    readCatalogStore(),
    readShippingStore()
  ]);
  const product = findActiveProductBySlug(store, slug);
  if (!product) {
    throw new HttpError(404, "Product not found.");
  }

  const quantity = Number(input.quantity || 1);
  const lines = [
    {
      qty: quantity,
      deadWeightKg: Number(product.deadWeightKg || 0),
      lengthCm:
        product.lengthCm === null || product.lengthCm === undefined
          ? null
          : Number(product.lengthCm),
      widthCm:
        product.widthCm === null || product.widthCm === undefined
          ? null
          : Number(product.widthCm),
      heightCm:
        product.heightCm === null || product.heightCm === undefined
          ? null
          : Number(product.heightCm)
    }
  ];
  const destination = {
    pincode: input.pincode
  };

  const provider = createShippingProvider("manual_courier");
  const [standardQuote, expressQuote] = await Promise.all([
    provider.calculateShipping({
      lines,
      shippingMethod: SHIPPING_METHODS.STANDARD,
      destination,
      shippingStore
    }),
    provider.calculateShipping({
      lines,
      shippingMethod: SHIPPING_METHODS.EXPRESS,
      destination,
      shippingStore
    })
  ]);

  return {
    productId: product.id,
    productSlug: product.slug,
    pincode: input.pincode,
    quantity,
    currency: "INR",
    options: [
      {
        service: "standard",
        label: "Standard",
        etaDaysMin: 4,
        etaDaysMax: 7,
        zone: standardQuote.zone,
        zoneLabel: standardQuote.zoneLabel,
        totalWeightKg: standardQuote.totalWeightKg,
        remoteExtraCharge: standardQuote.remoteExtraCharge,
        shippingCharge: Number(standardQuote.shippingCharge || 0)
      },
      {
        service: "express",
        label: "Express",
        etaDaysMin: 2,
        etaDaysMax: 4,
        zone: expressQuote.zone,
        zoneLabel: expressQuote.zoneLabel,
        totalWeightKg: expressQuote.totalWeightKg,
        remoteExtraCharge: expressQuote.remoteExtraCharge,
        shippingCharge: Number(expressQuote.shippingCharge || 0)
      }
    ],
    note: "Pre-check estimate only. Final shipping charge is locked at checkout in Phase 8."
  };
}

async function getProductInventoryView(productId) {
  const store = await readCatalogStore();
  const row = store.products.find((product) => product.id === productId);
  if (!row) {
    throw new HttpError(404, "Product not found.");
  }

  return {
    id: row.id,
    title: row.title,
    sku: row.sku,
    stockQty: Number(row.stockQty || 0),
    reservedQty: Number(row.reservedQty || 0),
    availableQty: calculateAvailableQty(row),
    stockStatus: row.stockStatus,
    stockVisibility: "hide_quantity",
    allowBackorder: Boolean(row.allowBackorder),
    maxOrderQty: Number(row.maxOrderQty || 1000),
    lowStockThreshold: Number(row.lowStockThreshold || 0)
  };
}

module.exports = {
  listAdminProducts,
  getAdminProductById,
  createProduct,
  updateProduct,
  updateProductRelations,
  archiveProduct,
  addProductImage,
  listPublicProducts,
  getPublicProductBySlug,
  getPublicProductRecommendations,
  getPublicProductPage,
  estimateProductShipping,
  getProductInventoryView
};
