const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readAuthStore } = require("../../database/auth-store");
const { env } = require("../../config/env");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { readShippingStore } = require("../../database/shipping-store");
const { readSearchStore } = require("../../database/search-store");
const {
  createShippingProvider
} = require("../../integrations/shipping-providers/shipping-provider.adapter");
const { convertToWebp } = require("../../common/image-utils");
const { sanitizeRichText } = require("../../common/html-sanitizer");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { listHelpfulGuidesForProduct } = require("../blogs/blogs.service");
const { buildProductPageSeoPayload } = require("../seo/seo.service");
const { trackCustomerProductView } = require("../search/search.service");
const { SHIPPING_METHODS } = require("../shipping/shipping.model");
const {
  ensureCustomerAccountShape
} = require("../customer-account/customer-account.model");
const {
  buildCustomerPricingContext
} = require("../customers/customers.model");
const {
  PRODUCT_RELATION_TYPES,
  calculateAvailableQty,
  resolveStockStatus,
  createEmptyProductRelations,
  sanitizeCustomerSpecificPrices,
  sanitizePriceGroupPrices,
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

  if (filters.availability === "in_stock") {
    rows = rows.filter(
      (product) => calculateAvailableQty(product) > 0 || Boolean(product.allowBackorder)
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

    rows.push(
      toPublicProductCard(product, {
        customerPricingContext: options.customerPricingContext || null
      })
    );
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
      ...toPublicProductCard(product, {
        customerPricingContext: options.customerPricingContext || null
      }),
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
      ...toPublicProductCard(product, {
        customerPricingContext: options.customerPricingContext || null
      }),
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

async function resolveCustomerPricingContext(customerId) {
  if (!customerId) {
    return null;
  }

  const authStore = await readAuthStore();
  const customer = Array.isArray(authStore.users)
    ? authStore.users.find((row) => row.id === customerId)
    : null;

  if (!customer) {
    return null;
  }

  ensureCustomerAccountShape(customer);
  return buildCustomerPricingContext(customer);
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
    priceGroupPrices: sanitizePriceGroupPrices(payload.priceGroupPrices || []),
    customerSpecificPrices: sanitizeCustomerSpecificPrices(
      payload.customerSpecificPrices || []
    ),
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
    videos: Array.isArray(payload.videos) && payload.videos.length
      ? payload.videos
      : payload.youtubeUrl ? [{ url: payload.youtubeUrl, label: "" }] : [],
    videoUrls: [],
    metaTitle: payload.metaTitle || "",
    metaDescription: payload.metaDescription || "",
    metaKeywords: payload.metaKeywords || "",
    stockQty: Number(payload.stockQty || 0),
    reservedQty: Number(payload.reservedQty || 0),
    stockStatus:
      payload.stockStatus ||
      resolveStockStatus({
        stockQty: Number(payload.stockQty || 0),
        reservedQty: Number(payload.reservedQty || 0),
        lowStockThreshold: Number(payload.lowStockThreshold || 0),
        allowBackorder: Boolean(payload.allowBackorder)
      }),
    stockVisibility: "hide_quantity",
    allowBackorder: Boolean(payload.allowBackorder),
    maxOrderQty: Number(payload.maxOrderQty || 1000),
    lowStockThreshold: Number(payload.lowStockThreshold || 0),
    priceIncludesGst: Boolean(payload.priceIncludesGst),
    shippingIncluded: Boolean(payload.shippingIncluded),
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
    priceGroupPrices:
      patch.priceGroupPrices === undefined
        ? sanitizePriceGroupPrices(current.priceGroupPrices)
        : sanitizePriceGroupPrices(patch.priceGroupPrices),
    customerSpecificPrices:
      patch.customerSpecificPrices === undefined
        ? sanitizeCustomerSpecificPrices(current.customerSpecificPrices)
        : sanitizeCustomerSpecificPrices(patch.customerSpecificPrices),
    quoteRequiredAboveQty:
      patch.quoteRequiredAboveQty === undefined
        ? current.quoteRequiredAboveQty
        : patch.quoteRequiredAboveQty === null
          ? null
          : Number(patch.quoteRequiredAboveQty),
    updatedAt: new Date().toISOString()
  };

  // Same rule as bulkPatchProducts: if a stock-relevant field changed but the
  // caller didn't also explicitly set stockStatus, re-derive it — otherwise
  // the admin's single-product edit form can zero out stockQty while leaving
  // a stale "in_stock" status, and the storefront (which only reads
  // stockStatus) keeps selling an item with zero available quantity.
  const stockRelevantFieldsChanged =
    patch.stockQty !== undefined ||
    patch.reservedQty !== undefined ||
    patch.allowBackorder !== undefined ||
    patch.lowStockThreshold !== undefined;

  if (stockRelevantFieldsChanged && patch.stockStatus === undefined) {
    next.stockStatus = resolveStockStatus(next);
  }

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

async function deleteProduct(productId, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((product) => product.id === productId);
  if (index < 0) {
    throw new HttpError(404, "Product not found.");
  }
  const deleted = store.products[index];
  store.products.splice(index, 1);
  await writeCatalogStore(store);

  await addActivityLog({
    action: "products.deleted",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "product",
    resourceId: productId,
    meta: { title: deleted.title, sku: deleted.sku }
  });

  return { id: productId };
}

async function addProductImage(productId, filePath, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((product) => product.id === productId);
  if (index < 0) {
    throw new HttpError(404, "Product not found.");
  }

  // Convert to WebP and create thumbnail; falls back to original if sharp fails
  let mainPath = filePath;
  let thumbPath = null;
  try {
    const result = await convertToWebp(filePath);
    mainPath = result.mainPath;
    thumbPath = result.thumbPath;
  } catch {
    // keep original file if conversion fails
  }

  const imageUrl = publicBaseUploadUrl(mainPath);
  const thumbnail = thumbPath ? publicBaseUploadUrl(thumbPath) : imageUrl;

  const currentImages = Array.isArray(store.products[index].images)
    ? [...store.products[index].images]
    : [];
  currentImages.push({ url: imageUrl, thumbnail });

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
    metadata: { imageUrl, thumbnail }
  });

  return { productId, imageUrl, thumbnail, imageCount: currentImages.length };
}

async function deleteProductImage(productId, imageUrl, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((p) => p.id === productId);
  if (index < 0) throw new HttpError(404, "Product not found.");

  const current = store.products[index];
  const images = Array.isArray(current.images)
    ? current.images.filter((img) => {
        const url = typeof img === "string" ? img : img.url;
        return url !== imageUrl;
      })
    : [];
  store.products[index] = { ...current, images, updatedAt: new Date().toISOString() };
  await writeCatalogStore(store);
  await addActivityLog({ action: "products.image.deleted", actorId: actor.id, actorRole: actor.role, resourceType: "product", resourceId: productId });
  return { productId, imageCount: images.length };
}

async function addProductVideo(productId, filePath, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((p) => p.id === productId);
  if (index < 0) throw new HttpError(404, "Product not found.");

  const videoUrl = publicBaseUploadUrl(filePath);
  const current = store.products[index];
  const videoUrls = Array.isArray(current.videoUrls) ? [...current.videoUrls, videoUrl] : [videoUrl];
  store.products[index] = { ...current, videoUrls, updatedAt: new Date().toISOString() };
  await writeCatalogStore(store);
  await addActivityLog({ action: "products.video.uploaded", actorId: actor.id, actorRole: actor.role, resourceType: "product", resourceId: productId });
  return { productId, videoUrl, videoCount: videoUrls.length };
}

async function addProductDocument(productId, title, filePath, actor) {
  const store = await readCatalogStore();
  const index = store.products.findIndex((p) => p.id === productId);
  if (index < 0) throw new HttpError(404, "Product not found.");

  const url = publicBaseUploadUrl(filePath);
  const current = store.products[index];
  const downloads = normalizeDownloads([...(current.downloads || []), { title, url }]);
  store.products[index] = { ...current, downloads, updatedAt: new Date().toISOString() };
  await writeCatalogStore(store);
  await addActivityLog({ action: "products.document.uploaded", actorId: actor.id, actorRole: actor.role, resourceType: "product", resourceId: productId });
  return { productId, url, title, downloadCount: downloads.length };
}

async function exportGoogleShoppingFeed() {
  const store = await readCatalogStore();
  const active = store.products.filter((p) => p.isActive);

  const headers = [
    "id", "title", "description", "link", "image_link",
    "price", "availability", "condition", "brand",
    "google_product_category", "product_type"
  ];

  const escape = (v) => String(v || "").replace(/\t|\n|\r/g, " ");
  const rows = active.map((p) => {
    const price = `${Number(p.salePrice || p.basePrice || 0).toFixed(2)} INR`;
    const availability = p.stockStatus === "out_of_stock" ? "out of stock" : "in stock";
    const image = Array.isArray(p.images) && p.images[0] ? p.images[0] : "";
    const link = `${env.storefrontBaseUrl}/products/${p.slug}`;
    const title = escape(p.googleShoppingTitle || p.title);
    const desc = escape(p.googleShoppingDescription || p.shortDescription || "");
    return [
      escape(p.sku || p.id), title, desc, link, escape(image),
      price, availability, "new", escape(p.brand),
      escape(p.googleProductCategory), escape(p.productType)
    ].join("\t");
  });

  return [headers.join("\t"), ...rows].join("\n");
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

async function listPublicProducts(filters, options = {}) {
  const store = await readCatalogStore();
  const customerPricingContext = await resolveCustomerPricingContext(options.customerId);
  let rows = store.products.filter((product) => product.isActive);
  rows = filterProducts(rows, filters);
  const sorted = sortProducts(rows);

  // Paginated response when limit is requested
  if (options.limit) {
    const offset = options.offset || 0;
    const slice = sorted.slice(offset, offset + options.limit);
    return {
      items: slice.map((product) => toPublicProduct(product, { customerPricingContext })),
      total: sorted.length,
      hasMore: offset + options.limit < sorted.length,
      offset,
      limit: options.limit
    };
  }

  // Backward-compatible flat array
  return sorted.map((product) => toPublicProduct(product, { customerPricingContext }));
}

async function getPublicProductBySlug(slug, options = {}) {
  const store = await readCatalogStore();
  const row = findActiveProductBySlug(store, slug);
  if (!row) {
    throw new HttpError(404, "Product not found.");
  }
  const customerPricingContext = await resolveCustomerPricingContext(options.customerId);
  return toPublicProduct(row, {
    customerPricingContext
  });
}

async function getPublicProductRecommendations(slug, options) {
  const [catalogStore, searchStore, customerPricingContext] = await Promise.all([
    readCatalogStore(),
    readSearchStore(),
    resolveCustomerPricingContext(options.customerId)
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
      limit: options.limitPerGroup,
      customerPricingContext
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
  const customerPricingContext = await resolveCustomerPricingContext(options.customerId);
  const publicProduct = toPublicProduct(product, {
    customerPricingContext
  });
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
          : Number(product.heightCm),
      shippingIncluded: Boolean(product.shippingIncluded),
      shippingClass: product.shippingClass || "normal"
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

async function bulkImportProducts(items) {
  const store = await readCatalogStore();
  const existingSlugs = new Set(store.products.map((p) => p.slug));
  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;

  for (const item of items) {
    const slug = item.slug ? slugify(item.slug) : slugify(item.title);
    if (existingSlugs.has(slug)) {
      skipped++;
      continue;
    }

    const sku = generateSku(store);
    const basePrice = Number(item.basePrice) || 0;
    const salePrice =
      item.salePrice === undefined || item.salePrice === null
        ? basePrice
        : Number(item.salePrice);

    const product = {
      id: generateId("prd"),
      title: item.title,
      slug,
      sku,
      oldUrl: item.oldUrl || "",
      categoryId: null,
      subcategoryId: null,
      brand: "",
      modelNumber: "",
      mpn: "",
      gtin: "",
      hsnCode: "",
      gstRate: Number(item.gstRate) || 18,
      basePrice,
      salePrice,
      images: Array.isArray(item.images) ? item.images : [],
      // Bulk import feeds scraped/migrated CSV data straight in, bypassing the
      // create-product Zod validator's sanitizeRichText transform — sanitize here too.
      shortDescription: sanitizeRichText(item.shortDescription || ""),
      fullDescription: sanitizeRichText(item.fullDescription || ""),
      keyFeatures: normalizeKeyFeatures(item.keyFeatures || []),
      specifications: item.specifications || {},
      downloads: [],
      technicalKeywords: [],
      customerKeywords: [],
      useCases: [],
      problemStatements: [],
      relations: createEmptyProductRelations(),
      moq: 1,
      bulkPricingEnabled: false,
      bulkPriceSlabs: [],
      priceGroupPrices: [],
      customerSpecificPrices: [],
      quoteRequiredAboveQty: null,
      deadWeightKg: 0,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
      shippingClass: "normal",
      googleShoppingTitle: "",
      googleShoppingDescription: "",
      googleProductCategory: "",
      productType: "",
      stockQty: Number(item.stockQty) || 0,
      reservedQty: 0,
      stockStatus: item.stockStatus || "in_stock",
      stockVisibility: "hide_quantity",
      allowBackorder: false,
      maxOrderQty: 1000,
      lowStockThreshold: 0,
      isActive: item.isActive !== false,
      seoTitle: item.seoTitle || "",
      seoDescription: item.seoDescription || "",
      _migrated: true,
      _migratedAt: item._migratedAt || now,
      createdAt: now,
      updatedAt: now
    };

    store.products.push(product);
    existingSlugs.add(slug);
    imported++;
  }

  await writeCatalogStore(store);
  return { imported, skipped, total: items.length };
}

async function bulkPatchProducts(updates, actor) {
  const store = await readCatalogStore();
  const now = new Date().toISOString();
  let updated = 0;
  const errors = [];

  for (const update of updates) {
    const index = store.products.findIndex((p) => p.id === update.id);
    if (index < 0) {
      errors.push({ id: update.id, error: "Not found" });
      continue;
    }

    const current = store.products[index];
    const patch = {};
    let hasError = false;

    if (update.sku !== undefined) patch.sku = String(update.sku || "").trim();
    if (update.brand !== undefined) patch.brand = String(update.brand || "").trim();
    if (update.modelNumber !== undefined) patch.modelNumber = String(update.modelNumber || "").trim();

    if (update.categoryId !== undefined) {
      if (update.categoryId) {
        const cat = store.categories.find((c) => c.id === update.categoryId);
        if (!cat) {
          errors.push({ id: update.id, error: `Invalid categoryId: ${update.categoryId}` });
          hasError = true;
        }
      }
      if (!hasError) patch.categoryId = update.categoryId || null;
    }

    if (!hasError && update.hsnCode !== undefined && update.hsnCode) {
      const hsnNorm = normalizeHsnCode(update.hsnCode);
      const hsn = store.hsnTaxMaster.find((r) => r.hsnCode === hsnNorm);
      if (!hsn) {
        errors.push({ id: update.id, error: `Invalid hsnCode: ${update.hsnCode}` });
        hasError = true;
      } else {
        patch.hsnCode = hsn.hsnCode;
        patch.gstRate = hsn.gstRate;
      }
    }

    if (hasError) continue;

    if (update.stockQty !== undefined) patch.stockQty = Math.max(0, Number(update.stockQty) || 0);
    if (update.stockStatus !== undefined) patch.stockStatus = update.stockStatus;
    if (update.basePrice !== undefined) patch.basePrice = Number(update.basePrice);
    if (update.salePrice !== undefined) patch.salePrice = Number(update.salePrice);
    if (update.isActive !== undefined) patch.isActive = Boolean(update.isActive);

    // Quantity changed but status wasn't explicitly set in this same call —
    // re-derive it so the storefront (which only ever reads stockStatus,
    // never the raw quantity) doesn't keep showing a stale "in stock" price
    // after an admin zeroes out the qty from the products list quick-edit.
    if (update.stockQty !== undefined && update.stockStatus === undefined) {
      patch.stockStatus = resolveStockStatus({ ...current, ...patch });
    }

    store.products[index] = { ...current, ...patch, updatedAt: now };
    updated++;
  }

  await writeCatalogStore(store);

  if (updated > 0) {
    await addActivityLog({
      action: "products.bulk_patched",
      actorId: actor.id,
      actorRole: actor.role,
      resourceType: "product",
      resourceId: `bulk:${updated}`
    });
  }

  return { updated, errors };
}

module.exports = {
  listAdminProducts,
  getAdminProductById,
  createProduct,
  updateProduct,
  updateProductRelations,
  archiveProduct,
  deleteProduct,
  addProductImage,
  deleteProductImage,
  addProductVideo,
  addProductDocument,
  exportGoogleShoppingFeed,
  bulkImportProducts,
  bulkPatchProducts,
  listPublicProducts,
  getPublicProductBySlug,
  getPublicProductRecommendations,
  getPublicProductPage,
  estimateProductShipping,
  getProductInventoryView
};
