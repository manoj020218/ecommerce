const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok } = require("../../common/http-response");
const service = require("./catalogue.service");
const { parseExportProductsQuery } = require("./catalogue.validator");

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

const adminCatalogueSummary = asyncHandler(async (_req, res) => {
  const data = await service.getCatalogueSummary();
  return ok(res, data, "Catalogue summary fetched.");
});

const adminExportProducts = asyncHandler(async (req, res) => {
  const filters = parseExportProductsQuery(req.query || {});
  const data = await service.exportProducts(filters);
  return ok(res, data, "Catalogue product export ready.");
});

const adminImportProductsPlaceholder = asyncHandler(async (_req, res) => {
  const data = await service.importProductsPlaceholder();
  return ok(res, data, "Catalogue import placeholder.");
});

module.exports = {
  adminCatalogueSummary,
  adminExportProducts,
  adminImportProductsPlaceholder
};
