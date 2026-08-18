function calculateAvailableQty(product) {
  const stockQty = Number(product.stockQty || 0);
  const reservedQty = Number(product.reservedQty || 0);
  return Math.max(0, stockQty - reservedQty);
}

// Single source of truth for deriving the displayed stock status from the
// real quantity — any write path that changes stockQty/reservedQty must
// recompute this, or the storefront (which only ever reads stockStatus)
// silently drifts from actual availability.
function resolveStockStatus(product) {
  const availableQty = calculateAvailableQty(product);
  const lowStockThreshold = Number(product.lowStockThreshold || 0);

  if (availableQty <= 0) {
    return product.allowBackorder ? "backorder" : "out_of_stock";
  }

  if (availableQty <= lowStockThreshold) {
    return "low_stock";
  }

  return "in_stock";
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizePriceKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
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

function sanitizePriceGroupPrices(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const deduped = new Map();

  for (const row of rows) {
    const priceGroup = normalizePriceKey(row?.priceGroup);
    const unitPrice = Number(row?.unitPrice);
    if (!priceGroup || Number.isNaN(unitPrice) || unitPrice < 0) {
      continue;
    }
    deduped.set(priceGroup, {
      priceGroup,
      unitPrice: roundMoney(unitPrice)
    });
  }

  return [...deduped.values()].sort((a, b) => a.priceGroup.localeCompare(b.priceGroup));
}

function sanitizeCustomerSpecificPrices(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const deduped = new Map();

  for (const row of rows) {
    const customerId = String(row?.customerId || "").trim();
    const unitPrice = Number(row?.unitPrice);
    if (!customerId || Number.isNaN(unitPrice) || unitPrice < 0) {
      continue;
    }
    deduped.set(customerId, {
      customerId,
      unitPrice: roundMoney(unitPrice)
    });
  }

  return [...deduped.values()].sort((a, b) => a.customerId.localeCompare(b.customerId));
}

function getRetailDisplayPrice(product) {
  const basePrice = Number(product.basePrice || 0);
  const salePrice = Number(product.salePrice || 0);

  if (salePrice > 0) {
    return salePrice;
  }

  return basePrice;
}

function buildBulkPriceRule(product, qty) {
  const baseUnitPrice = getRetailDisplayPrice(product);
  const slabs = Array.isArray(product.bulkPriceSlabs)
    ? [...product.bulkPriceSlabs]
        .map((slab) => ({
          minQty: Number(slab.minQty),
          unitPrice: roundMoney(slab.unitPrice)
        }))
        .filter((slab) => slab.minQty > 0 && !Number.isNaN(slab.unitPrice))
        .sort((a, b) => a.minQty - b.minQty)
    : [];

  if (!product.bulkPricingEnabled || slabs.length === 0) {
    return {
      unitPrice: baseUnitPrice,
      bulkApplied: false,
      bulkRule: null
    };
  }

  let selected = null;
  for (const slab of slabs) {
    if (qty >= slab.minQty) {
      selected = slab;
    }
  }

  if (!selected) {
    return {
      unitPrice: baseUnitPrice,
      bulkApplied: false,
      bulkRule: null
    };
  }

  return {
    unitPrice: roundMoney(selected.unitPrice),
    bulkApplied: true,
    bulkRule: {
      minQty: Number(selected.minQty),
      unitPrice: roundMoney(selected.unitPrice)
    }
  };
}

function resolveRetailPriceSource(product) {
  const basePrice = Number(product.basePrice || 0);
  const salePrice = Number(product.salePrice || 0);
  if (salePrice > 0 && salePrice < basePrice) {
    return "sale";
  }
  return "base";
}

function resolveProductUnitPrice(product, options = {}) {
  const qty = Math.max(1, Number(options.qty || 1));
  const customerPricingContext = options.customerPricingContext || null;
  const customerSpecificPrices = sanitizeCustomerSpecificPrices(
    product.customerSpecificPrices
  );
  const priceGroupPrices = sanitizePriceGroupPrices(product.priceGroupPrices);
  const retailDisplayPrice = getRetailDisplayPrice(product);

  if (
    customerPricingContext?.isB2BApproved &&
    customerPricingContext.customerId
  ) {
    const customerSpecificPrice = customerSpecificPrices.find(
      (row) => row.customerId === customerPricingContext.customerId
    );

    if (customerSpecificPrice) {
      return {
        unitPrice: roundMoney(customerSpecificPrice.unitPrice),
        priceSource: "customer_specific",
        bulkApplied: false,
        bulkRule: null,
        retailDisplayPrice
      };
    }

    const nextPriceGroup = normalizePriceKey(
      customerPricingContext.priceGroup || customerPricingContext.customerType || ""
    );
    const priceGroupPrice = priceGroupPrices.find(
      (row) => row.priceGroup === nextPriceGroup
    );

    if (priceGroupPrice) {
      return {
        unitPrice: roundMoney(priceGroupPrice.unitPrice),
        priceSource: "price_group",
        bulkApplied: false,
        bulkRule: null,
        retailDisplayPrice
      };
    }
  }

  const bulkPrice = buildBulkPriceRule(product, qty);
  if (bulkPrice.bulkApplied) {
    return {
      unitPrice: roundMoney(bulkPrice.unitPrice),
      priceSource: "bulk",
      bulkApplied: true,
      bulkRule: bulkPrice.bulkRule,
      retailDisplayPrice
    };
  }

  return {
    unitPrice: roundMoney(retailDisplayPrice),
    priceSource: resolveRetailPriceSource(product),
    bulkApplied: false,
    bulkRule: null,
    retailDisplayPrice
  };
}

function buildPublicPricing(product, customerPricingContext, qty = 1) {
  const resolved = resolveProductUnitPrice(product, {
    qty,
    customerPricingContext
  });
  const retailDisplayPrice = roundMoney(resolved.retailDisplayPrice);
  const basePrice = roundMoney(product.basePrice);

  let compareAtPrice = null;
  if (retailDisplayPrice > resolved.unitPrice) {
    compareAtPrice = retailDisplayPrice;
  } else if (basePrice > resolved.unitPrice) {
    compareAtPrice = basePrice;
  }

  return {
    visiblePrice: roundMoney(resolved.unitPrice),
    compareAtPrice: compareAtPrice === null ? null : roundMoney(compareAtPrice),
    priceSource: resolved.priceSource,
    isB2BPrice: ["customer_specific", "price_group"].includes(resolved.priceSource),
    bulkApplied: Boolean(resolved.bulkApplied),
    bulkRule: resolved.bulkRule || null,
    customerType: customerPricingContext?.customerType || "retail",
    priceGroup: customerPricingContext?.priceGroup || "",
    isB2BApproved: Boolean(customerPricingContext?.isB2BApproved),
    usesOrderRequestFlow: Boolean(customerPricingContext?.usesOfflineOrderRequest)
  };
}

// Resolves a cart line's chosen customOptions (group id -> choice id) into
// the actual per-unit price delta plus a resolved-label breakdown for
// order/invoice display. Falls back to each group's `default: true` choice
// (or the first choice) when the cart item didn't specify one, so a line
// never silently prices at zero for a required-but-unselected group.
function resolveCustomOptionsSelection(product, customization) {
  const groups = Array.isArray(product.customOptions) ? product.customOptions : [];
  const selection = customization && typeof customization === "object" ? customization : {};

  let unitDelta = 0;
  const resolved = [];

  for (const group of groups) {
    const choices = Array.isArray(group.choices) ? group.choices : [];
    if (!choices.length) continue;

    const chosenId = selection[group.id];
    const choice =
      choices.find((row) => row.id === chosenId) ||
      choices.find((row) => row.default) ||
      choices[0];

    unitDelta += Number(choice.priceDelta || 0);
    resolved.push({
      groupId: group.id,
      groupLabel: group.label,
      choiceId: choice.id,
      choiceLabel: choice.label,
      priceDelta: Number(choice.priceDelta || 0),
      safeZoneTemplateId: choice.safeZoneTemplateId || ""
    });
  }

  return { unitDelta, resolved };
}

function sanitizeAdminProduct(product) {
  return {
    ...product,
    priceGroupPrices: sanitizePriceGroupPrices(product.priceGroupPrices),
    customerSpecificPrices: sanitizeCustomerSpecificPrices(
      product.customerSpecificPrices
    ),
    availableQty: calculateAvailableQty(product)
  };
}

function toPublicProduct(product, options = {}) {
  const pricing = buildPublicPricing(
    product,
    options.customerPricingContext || null,
    options.qty || 1
  );

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
    priceIncludesGst: Boolean(product.priceIncludesGst),
    shippingIncluded: Boolean(product.shippingIncluded),
    basePrice: Number(product.basePrice || 0),
    salePrice: Number(product.salePrice || 0),
    pricing,
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
    priceGroupPrices: sanitizePriceGroupPrices(product.priceGroupPrices),
    customerSpecificPrices: [],
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
    fulfillmentType: product.fulfillmentType || "standard",
    uploadMode: product.uploadMode || "single_design",
    uploadSpec: product.uploadSpec || {},
    customOptions: Array.isArray(product.customOptions) ? product.customOptions : [],
    printTemplates: Array.isArray(product.printTemplates) ? product.printTemplates : [],
    relations: sanitizeProductRelations(product.relations),
    stockStatus: product.stockStatus || "in_stock",
    stockVisibility: "hide_quantity",
    isPurchasable:
      calculateAvailableQty(product) > 0 || Boolean(product.allowBackorder),
    // Caps the storefront qty stepper so a buyer can't select more than can
    // actually be ordered, without revealing the exact stock count (stays
    // consistent with stockVisibility: "hide_quantity" above).
    maxOrderableQty: Boolean(product.allowBackorder)
      ? Number(product.maxOrderQty || 1000)
      : Math.max(0, Math.min(calculateAvailableQty(product), Number(product.maxOrderQty || 1000))),
    isActive: Boolean(product.isActive),
    productLabel: product.productLabel || "",
    tags: Array.isArray(product.tags) ? [...product.tags] : [],
    avgRating: Number(product.avgRating || 0),
    reviewCount: Number(product.reviewCount || 0),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function toPublicProductCard(product, options = {}) {
  const images = Array.isArray(product.images) ? [...product.images] : [];
  const pricing = buildPublicPricing(
    product,
    options.customerPricingContext || null,
    options.qty || 1
  );
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    brand: product.brand || "",
    basePrice: Number(product.basePrice || 0),
    salePrice: Number(product.salePrice || 0),
    pricing,
    images,
    stockStatus: product.stockStatus || "in_stock",
    isPurchasable:
      calculateAvailableQty(product) > 0 || Boolean(product.allowBackorder),
    avgRating: Number(product.avgRating || 0),
    reviewCount: Number(product.reviewCount || 0)
  };
}

module.exports = {
  PRODUCT_RELATION_TYPES,
  calculateAvailableQty,
  resolveStockStatus,
  sanitizePriceGroupPrices,
  sanitizeCustomerSpecificPrices,
  resolveProductUnitPrice,
  buildPublicPricing,
  resolveCustomOptionsSelection,
  createEmptyProductRelations,
  sanitizeProductRelations,
  sanitizeAdminProduct,
  toPublicProduct,
  toPublicProductCard
};
