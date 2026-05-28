const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./products.service");
const {
  parseListAdminProductsQuery,
  parseListPublicProductsQuery,
  parseCreateProductPayload,
  parseUpdateProductPayload,
  parsePublicProductRecommendationsQuery,
  parseUpdateProductRelationsPayload,
  parseShippingEstimatePayload
} = require("./products.validator");

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

const adminListProducts = asyncHandler(async (req, res) => {
  const filters = parseListAdminProductsQuery(req.query || {});
  const data = await service.listAdminProducts(filters);
  return ok(res, data, "Products fetched.");
});

const adminGetProduct = asyncHandler(async (req, res) => {
  const data = await service.getAdminProductById(req.params.productId);
  return ok(res, data, "Product fetched.");
});

const adminCreateProduct = asyncHandler(async (req, res) => {
  const payload = parseCreateProductPayload(req.body);
  const data = await service.createProduct(payload, req.actor);
  return created(res, data, "Product created.");
});

const adminUpdateProduct = asyncHandler(async (req, res) => {
  const patch = parseUpdateProductPayload(req.body);
  const data = await service.updateProduct(req.params.productId, patch, req.actor);
  return ok(res, data, "Product updated.");
});

const adminUpdateProductRelations = asyncHandler(async (req, res) => {
  const relationsPatch = parseUpdateProductRelationsPayload(req.body);
  const data = await service.updateProductRelations(
    req.params.productId,
    relationsPatch,
    req.actor
  );
  return ok(res, data, "Product relations updated.");
});

const adminArchiveProduct = asyncHandler(async (req, res) => {
  const data = await service.archiveProduct(req.params.productId, req.actor);
  return ok(res, data, "Product archived.");
});

const adminUploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.path) {
    throw new HttpError(400, "Image file is required.");
  }

  const data = await service.addProductImage(
    req.params.productId,
    req.file.path,
    req.actor
  );
  return created(res, data, "Product image uploaded.");
});

const publicListProducts = asyncHandler(async (req, res) => {
  const filters = parseListPublicProductsQuery(req.query || {});
  const data = await service.listPublicProducts(filters, {
    customerId: req.customer?.id || null
  });
  return ok(res, data, "Public products fetched.");
});

const publicGetProductBySlug = asyncHandler(async (req, res) => {
  const data = await service.getPublicProductBySlug(req.params.slug, {
    customerId: req.customer?.id || null
  });
  return ok(res, data, "Public product fetched.");
});

const publicGetProductRecommendations = asyncHandler(async (req, res) => {
  const query = parsePublicProductRecommendationsQuery(req.query || {});
  const data = await service.getPublicProductRecommendations(req.params.slug, {
    customerId: req.customer?.id || null,
    limitPerGroup: query.limitPerGroup,
    historyLimit: query.historyLimit
  });
  return ok(res, data, "Product recommendations fetched.");
});

const publicGetProductPage = asyncHandler(async (req, res) => {
  const query = parsePublicProductRecommendationsQuery(req.query || {});
  const data = await service.getPublicProductPage(req.params.slug, {
    customerId: req.customer?.id || null,
    limitPerGroup: query.limitPerGroup,
    historyLimit: query.historyLimit
  });
  return ok(res, data, "Product page payload fetched.");
});

const publicEstimateShipping = asyncHandler(async (req, res) => {
  const payload = parseShippingEstimatePayload(req.body);
  const data = await service.estimateProductShipping(req.params.slug, payload);
  return ok(res, data, "Shipping estimate prepared.");
});

module.exports = {
  adminListProducts,
  adminGetProduct,
  adminCreateProduct,
  adminUpdateProduct,
  adminUpdateProductRelations,
  adminArchiveProduct,
  adminUploadProductImage,
  publicListProducts,
  publicGetProductBySlug,
  publicGetProductRecommendations,
  publicGetProductPage,
  publicEstimateShipping
};
