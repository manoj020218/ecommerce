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

const adminDeleteProductImage = asyncHandler(async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) throw new HttpError(400, "imageUrl is required.");
  const data = await service.deleteProductImage(req.params.productId, imageUrl, req.actor);
  return ok(res, data, "Product image deleted.");
});

const adminUploadProductVideo = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.path) throw new HttpError(400, "Video file is required.");
  const data = await service.addProductVideo(req.params.productId, req.file.path, req.actor);
  return created(res, data, "Product video uploaded.");
});

const adminUploadProductDocument = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.path) throw new HttpError(400, "Document file is required.");
  const title = String(req.body.title || "").trim();
  if (!title) throw new HttpError(400, "Document title is required.");
  const data = await service.addProductDocument(req.params.productId, title, req.file.path, req.actor);
  return created(res, data, "Product document uploaded.");
});

const adminExportGoogleShopping = asyncHandler(async (req, res) => {
  const tsv = await service.exportGoogleShoppingFeed();
  res.setHeader("Content-Type", "text/tab-separated-values; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"google-shopping-feed.tsv\"");
  res.send(tsv);
});

function parseCsvBuffer(buffer) {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new HttpError(400, "CSV has no data rows.");

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let cur = "";
    let inQuote = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { values.push(cur); cur = ""; }
      else { cur += ch; }
    }
    values.push(cur);

    if (values.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || "").trim(); });
    rows.push(row);
  }
  return rows;
}

function csvRowsToImportItems(rows) {
  return rows
    .filter((r) => r.title && r.title.length > 2)
    .map((r) => ({
      title: r.title,
      slug: r.slug || "",
      oldUrl: r.oldUrl || "",
      brand: r.brand || "",
      sku: r.sku || "",
      basePrice: Number(r.basePrice) || 0,
      salePrice: Number(r.salePrice) || undefined,
      shortDescription: r.shortDescription || "",
      fullDescription: r.fullDescription || "",
      hsnCode: r.hsnCode || "",
      gstRate: Number(r.gstRate) || 18,
      isActive: r.isActive !== "false",
      stockStatus: r.stockStatus || "in_stock",
      images: [],
      keyFeatures: [],
      specifications: {}
    }));
}

const adminBulkImportProducts = asyncHandler(async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "Expected a non-empty array of products.");
  }
  if (items.length > 1000) {
    throw new HttpError(400, "Maximum 1000 products per import batch.");
  }
  const data = await service.bulkImportProducts(items);
  return created(res, data, `Imported ${data.imported} products, ${data.skipped} skipped.`);
});

const adminImportProductsFile = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    throw new HttpError(400, "No file uploaded. Send a .json or .csv file as multipart field named 'file'.");
  }

  const { originalname, buffer } = req.file;
  let items;

  if (originalname.endsWith(".csv")) {
    const rows = parseCsvBuffer(buffer);
    items = csvRowsToImportItems(rows);
  } else {
    try {
      items = JSON.parse(buffer.toString("utf8"));
    } catch {
      throw new HttpError(400, "Invalid JSON file.");
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, "File contains no importable products.");
  }
  if (items.length > 2000) {
    throw new HttpError(400, "Maximum 2000 products per import file.");
  }

  const data = await service.bulkImportProducts(items);
  return created(res, data, `Imported ${data.imported} products, ${data.skipped} skipped.`);
});

const adminBulkPatchProducts = asyncHandler(async (req, res) => {
  const { updates } = req.body || {};
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new HttpError(400, "Expected { updates: [...] }.");
  }
  const data = await service.bulkPatchProducts(updates, req.actor);
  return ok(res, data, `Updated ${data.updated} products.`);
});

const publicListProducts = asyncHandler(async (req, res) => {
  const filters = parseListPublicProductsQuery(req.query || {});
  const data = await service.listPublicProducts(filters, {
    customerId: req.customer?.id || null,
    limit: filters.limit,
    offset: filters.offset
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
  adminBulkImportProducts,
  adminBulkPatchProducts,
  adminImportProductsFile,
  adminListProducts,
  adminGetProduct,
  adminCreateProduct,
  adminUpdateProduct,
  adminUpdateProductRelations,
  adminArchiveProduct,
  adminUploadProductImage,
  adminDeleteProductImage,
  adminUploadProductVideo,
  adminUploadProductDocument,
  adminExportGoogleShopping,
  publicListProducts,
  publicGetProductBySlug,
  publicGetProductRecommendations,
  publicGetProductPage,
  publicEstimateShipping
};
