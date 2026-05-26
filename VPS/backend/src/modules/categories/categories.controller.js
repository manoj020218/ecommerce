const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./categories.service");
const {
  parseListAdminCategoriesQuery,
  parseCreateCategoryPayload,
  parseUpdateCategoryPayload
} = require("./categories.validator");

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

const adminListCategories = asyncHandler(async (req, res) => {
  const filters = parseListAdminCategoriesQuery(req.query || {});
  const data = await service.listAdminCategories(filters);
  return ok(res, data, "Categories fetched.");
});

const adminGetCategory = asyncHandler(async (req, res) => {
  const data = await service.getCategoryById(req.params.categoryId);
  return ok(res, data, "Category fetched.");
});

const adminCreateCategory = asyncHandler(async (req, res) => {
  const payload = parseCreateCategoryPayload(req.body);
  const data = await service.createCategory(payload, req.actor);
  return created(res, data, "Category created.");
});

const adminUpdateCategory = asyncHandler(async (req, res) => {
  const patch = parseUpdateCategoryPayload(req.body);
  const data = await service.updateCategory(req.params.categoryId, patch, req.actor);
  return ok(res, data, "Category updated.");
});

const adminArchiveCategory = asyncHandler(async (req, res) => {
  const data = await service.archiveCategory(req.params.categoryId, req.actor);
  return ok(res, data, "Category archived.");
});

const publicListCategories = asyncHandler(async (_req, res) => {
  const data = await service.listPublicCategories();
  return ok(res, data, "Public categories fetched.");
});

module.exports = {
  adminListCategories,
  adminGetCategory,
  adminCreateCategory,
  adminUpdateCategory,
  adminArchiveCategory,
  publicListCategories
};
