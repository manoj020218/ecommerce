const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { PRODUCT_RELATION_TYPES } = require("./products.model");

const positiveMoneySchema = z.coerce.number().min(0).max(100000000);
const qtySchema = z.coerce.number().int().min(0).max(100000000);

const bulkPriceSlabSchema = z.object({
  minQty: z.coerce.number().int().min(1).max(1000000),
  unitPrice: positiveMoneySchema
});

const priceGroupPriceSchema = z.object({
  priceGroup: z.string().trim().min(2).max(120),
  unitPrice: positiveMoneySchema
});

const customerSpecificPriceSchema = z.object({
  customerId: z.string().trim().min(2).max(160),
  unitPrice: positiveMoneySchema
});

const downloadItemSchema = z.object({
  title: z.string().trim().min(2).max(200),
  url: z.string().trim().min(3).max(1000)
});

const videoItemSchema = z.object({
  url: z.string().trim().min(4).max(500),
  label: z.string().trim().max(120).optional().default("")
});

const relationListSchema = z
  .array(z.string().trim().min(2).max(160))
  .max(200)
  .transform((values) => {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    }
    return result;
  });

const relationMapShape = PRODUCT_RELATION_TYPES.reduce((shape, key) => {
  shape[key] = relationListSchema.optional();
  return shape;
}, {});

const relationMapSchema = z.object(relationMapShape);

const listAdminProductsQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional().default(true),
  categoryId: z.string().trim().optional(),
  q: z.string().trim().max(120).optional().default("")
});

const listPublicProductsQuerySchema = z.object({
  categoryId: z.string().trim().optional(),
  q: z.string().trim().max(120).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

const publicProductRecommendationsQuerySchema = z.object({
  limitPerGroup: z.coerce.number().int().min(1).max(20).optional().default(10),
  historyLimit: z.coerce.number().int().min(1).max(20).optional().default(12)
});

const createProductSchema = z.object({
  title: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(2).max(200).optional(),
  oldUrl: z.string().trim().max(1000).optional().default(""),
  categoryId: z.string().trim().max(150).optional().nullable(),
  subcategoryId: z.string().trim().max(150).optional().nullable(),
  brand: z.string().trim().max(120).optional().default(""),
  modelNumber: z.string().trim().max(120).optional().default(""),
  mpn: z.string().trim().max(120).optional().default(""),
  gtin: z.string().trim().max(120).optional().default(""),
  hsnCode: z.string().trim().min(4).max(20),
  basePrice: positiveMoneySchema,
  salePrice: positiveMoneySchema.optional(),
  shortDescription: z.string().trim().max(2000).optional().default(""),
  fullDescription: z.string().trim().max(100000).optional().default(""),
  keyFeatures: z.array(z.string().trim().max(240)).optional().default([]),
  specifications: z.record(z.any()).optional().default({}),
  downloads: z.array(downloadItemSchema).optional().default([]),
  videos: z.array(videoItemSchema).optional().default([]),
  technicalKeywords: z.array(z.string().trim().max(120)).optional().default([]),
  customerKeywords: z.array(z.string().trim().max(120)).optional().default([]),
  useCases: z.array(z.string().trim().max(200)).optional().default([]),
  problemStatements: z.array(z.string().trim().max(200)).optional().default([]),
  relations: relationMapSchema.optional().default({}),
  moq: z.coerce.number().int().min(1).max(100000).optional().default(1),
  bulkPricingEnabled: z.boolean().optional().default(false),
  bulkPriceSlabs: z.array(bulkPriceSlabSchema).optional().default([]),
  priceGroupPrices: z.array(priceGroupPriceSchema).optional().default([]),
  customerSpecificPrices: z.array(customerSpecificPriceSchema).optional().default([]),
  quoteRequiredAboveQty: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .nullable()
    .default(null),
  deadWeightKg: z.coerce.number().min(0).max(5000).optional().default(0),
  lengthCm: z.coerce.number().min(0).max(5000).optional().nullable().default(null),
  widthCm: z.coerce.number().min(0).max(5000).optional().nullable().default(null),
  heightCm: z.coerce.number().min(0).max(5000).optional().nullable().default(null),
  shippingClass: z.string().trim().max(120).optional().default("normal"),
  googleShoppingTitle: z.string().trim().max(200).optional().default(""),
  googleShoppingDescription: z.string().trim().max(5000).optional().default(""),
  googleProductCategory: z.string().trim().max(250).optional().default(""),
  productType: z.string().trim().max(250).optional().default(""),
  youtubeUrl: z.string().trim().max(500).optional().default(""),
  metaTitle: z.string().trim().max(120).optional().default(""),
  metaDescription: z.string().trim().max(320).optional().default(""),
  metaKeywords: z.string().trim().max(500).optional().default(""),
  tags: z.array(z.string().trim().max(80)).max(30).optional().default([]),
  productLabel: z.string().trim().max(80).optional().default(""),
  isActive: z.boolean().optional().default(true),
  stockQty: qtySchema.optional().default(0),
  reservedQty: qtySchema.optional().default(0),
  stockStatus: z
    .enum(["in_stock", "low_stock", "out_of_stock", "backorder"])
    .optional()
    .default("in_stock"),
  allowBackorder: z.boolean().optional().default(false),
  priceIncludesGst: z.boolean().optional().default(false),
  maxOrderQty: z.coerce.number().int().min(1).max(100000).optional().default(1000),
  lowStockThreshold: z.coerce.number().int().min(0).max(100000).optional().default(0)
});

const updateProductSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  slug: z.string().trim().min(2).max(200).optional(),
  oldUrl: z.string().trim().max(1000).optional(),
  categoryId: z.string().trim().max(150).optional().nullable(),
  subcategoryId: z.string().trim().max(150).optional().nullable(),
  brand: z.string().trim().max(120).optional(),
  modelNumber: z.string().trim().max(120).optional(),
  mpn: z.string().trim().max(120).optional(),
  gtin: z.string().trim().max(120).optional(),
  hsnCode: z.string().trim().min(4).max(20).optional(),
  basePrice: positiveMoneySchema.optional(),
  salePrice: positiveMoneySchema.optional(),
  shortDescription: z.string().trim().max(2000).optional(),
  fullDescription: z.string().trim().max(100000).optional(),
  keyFeatures: z.array(z.string().trim().max(240)).optional(),
  specifications: z.record(z.any()).optional(),
  downloads: z.array(downloadItemSchema).optional(),
  videos: z.array(videoItemSchema).optional(),
  technicalKeywords: z.array(z.string().trim().max(120)).optional(),
  customerKeywords: z.array(z.string().trim().max(120)).optional(),
  useCases: z.array(z.string().trim().max(200)).optional(),
  problemStatements: z.array(z.string().trim().max(200)).optional(),
  relations: relationMapSchema.optional(),
  moq: z.coerce.number().int().min(1).max(100000).optional(),
  bulkPricingEnabled: z.boolean().optional(),
  bulkPriceSlabs: z.array(bulkPriceSlabSchema).optional(),
  priceGroupPrices: z.array(priceGroupPriceSchema).optional(),
  customerSpecificPrices: z.array(customerSpecificPriceSchema).optional(),
  quoteRequiredAboveQty: z.coerce.number().int().min(1).optional().nullable(),
  deadWeightKg: z.coerce.number().min(0).max(5000).optional(),
  lengthCm: z.coerce.number().min(0).max(5000).optional().nullable(),
  widthCm: z.coerce.number().min(0).max(5000).optional().nullable(),
  heightCm: z.coerce.number().min(0).max(5000).optional().nullable(),
  shippingClass: z.string().trim().max(120).optional(),
  googleShoppingTitle: z.string().trim().max(200).optional(),
  googleShoppingDescription: z.string().trim().max(5000).optional(),
  googleProductCategory: z.string().trim().max(250).optional(),
  productType: z.string().trim().max(250).optional(),
  youtubeUrl: z.string().trim().max(500).optional(),
  metaTitle: z.string().trim().max(120).optional(),
  metaDescription: z.string().trim().max(320).optional(),
  metaKeywords: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().max(80)).max(30).optional(),
  productLabel: z.string().trim().max(80).optional(),
  isActive: z.boolean().optional(),
  priceIncludesGst: z.boolean().optional()
});

const updateProductRelationsSchema = relationMapSchema.refine(
  (payload) =>
    PRODUCT_RELATION_TYPES.some(
      (relationType) => payload[relationType] !== undefined
    ),
  {
    message: "At least one relation array must be provided."
  }
);

const shippingEstimatePayloadSchema = z.object({
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/),
  quantity: z.coerce.number().int().min(1).max(100000).optional().default(1)
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListAdminProductsQuery(query) {
  return listAdminProductsQuerySchema.parse(query || {});
}

function parseListPublicProductsQuery(query) {
  return listPublicProductsQuerySchema.parse(query || {});
}

function parseCreateProductPayload(payload) {
  ensureObject(payload, "Create product");
  return createProductSchema.parse(payload);
}

function parseUpdateProductPayload(payload) {
  ensureObject(payload, "Update product");
  return updateProductSchema.parse(payload);
}

function parsePublicProductRecommendationsQuery(query) {
  return publicProductRecommendationsQuerySchema.parse(query || {});
}

function parseUpdateProductRelationsPayload(payload) {
  ensureObject(payload, "Update product relations");
  return updateProductRelationsSchema.parse(payload);
}

function parseShippingEstimatePayload(payload) {
  ensureObject(payload, "Shipping estimate");
  return shippingEstimatePayloadSchema.parse(payload);
}

module.exports = {
  parseListAdminProductsQuery,
  parseListPublicProductsQuery,
  parseCreateProductPayload,
  parseUpdateProductPayload,
  parsePublicProductRecommendationsQuery,
  parseUpdateProductRelationsPayload,
  parseShippingEstimatePayload
};
