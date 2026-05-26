function calculateAvailableQty(product) {
  const stockQty = Number(product.stockQty || 0);
  const reservedQty = Number(product.reservedQty || 0);
  return Math.max(0, stockQty - reservedQty);
}

const PRODUCT_RELATION_TYPES = Object.freeze([
  "related",
  "accessory",
  "required_with",
  "spare_part",
  "similar",
  "upgrade",
  "frequently_bought_together"
]);

function createEmptyProductRelations() {
  return {
    related: [],
    accessory: [],
    required_with: [],
    spare_part: [],
    similar: [],
    upgrade: [],
    frequently_bought_together: []
  };
}

function sanitizeProductRelations(relations) {
  const safe = createEmptyProductRelations();
  if (!relations || typeof relations !== "object" || Array.isArray(relations)) {
    return safe;
  }

  for (const relationType of PRODUCT_RELATION_TYPES) {
    safe[relationType] = Array.isArray(relations[relationType])
      ? [...new Set(relations[relationType].filter(Boolean).map((value) => String(value)))]
      : [];
  }

  return safe;
}

function sanitizeKeyFeatures(features) {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function sanitizeDownloads(downloads) {
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

function sanitizeAdminProduct(product) {
  return {
    ...product,
    availableQty: calculateAvailableQty(product)
  };
}

function toPublicProduct(product) {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    categoryId: product.categoryId || null,
    subcategoryId: product.subcategoryId || null,
    brand: product.brand || "",
    modelNumber: product.modelNumber || "",
    mpn: product.mpn || "",
    gtin: product.gtin || "",
    hsnCode: product.hsnCode || "",
    gstRate: Number(product.gstRate || 0),
    basePrice: Number(product.basePrice || 0),
    salePrice: Number(product.salePrice || 0),
    images: Array.isArray(product.images) ? [...product.images] : [],
    shortDescription: product.shortDescription || "",
    fullDescription: product.fullDescription || "",
    keyFeatures: sanitizeKeyFeatures(product.keyFeatures),
    specifications: product.specifications || {},
    downloads: sanitizeDownloads(product.downloads),
    technicalKeywords: Array.isArray(product.technicalKeywords)
      ? [...product.technicalKeywords]
      : [],
    customerKeywords: Array.isArray(product.customerKeywords)
      ? [...product.customerKeywords]
      : [],
    useCases: Array.isArray(product.useCases) ? [...product.useCases] : [],
    problemStatements: Array.isArray(product.problemStatements)
      ? [...product.problemStatements]
      : [],
    moq: Number(product.moq || 1),
    bulkPricingEnabled: Boolean(product.bulkPricingEnabled),
    bulkPriceSlabs: Array.isArray(product.bulkPriceSlabs)
      ? [...product.bulkPriceSlabs]
      : [],
    quoteRequiredAboveQty:
      product.quoteRequiredAboveQty === null ||
      product.quoteRequiredAboveQty === undefined
        ? null
        : Number(product.quoteRequiredAboveQty),
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
    shippingClass: product.shippingClass || "normal",
    googleShoppingTitle: product.googleShoppingTitle || "",
    googleShoppingDescription: product.googleShoppingDescription || "",
    googleProductCategory: product.googleProductCategory || "",
    productType: product.productType || "",
    relations: sanitizeProductRelations(product.relations),
    stockStatus: product.stockStatus || "in_stock",
    stockVisibility: "hide_quantity",
    isPurchasable:
      calculateAvailableQty(product) > 0 || Boolean(product.allowBackorder),
    isActive: Boolean(product.isActive),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function toPublicProductCard(product) {
  const images = Array.isArray(product.images) ? [...product.images] : [];
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    brand: product.brand || "",
    basePrice: Number(product.basePrice || 0),
    salePrice: Number(product.salePrice || 0),
    images,
    stockStatus: product.stockStatus || "in_stock",
    isPurchasable:
      calculateAvailableQty(product) > 0 || Boolean(product.allowBackorder)
  };
}

module.exports = {
  PRODUCT_RELATION_TYPES,
  calculateAvailableQty,
  createEmptyProductRelations,
  sanitizeProductRelations,
  sanitizeAdminProduct,
  toPublicProduct,
  toPublicProductCard
};
