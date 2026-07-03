const { ok, created } = require("../../common/http-response");
const service = require("./static-pages.service");

function asyncHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

const publicListPages = asyncHandler(async (req, res) => {
  const pages = await service.listPages(true);
  return ok(res, pages, "Pages fetched.");
});

const publicGetPage = asyncHandler(async (req, res) => {
  const page = await service.getPageBySlug(req.params.slug, false);
  return ok(res, page, "Page fetched.");
});

const adminListPages = asyncHandler(async (req, res) => {
  const pages = await service.listPages(false);
  return ok(res, pages, "Pages fetched.");
});

const adminGetPage = asyncHandler(async (req, res) => {
  const page = await service.getPageById(req.params.id);
  return ok(res, page, "Page fetched.");
});

const adminCreatePage = asyncHandler(async (req, res) => {
  const page = await service.createPage(req.body || {});
  return created(res, page, "Page created.");
});

const adminUpdatePage = asyncHandler(async (req, res) => {
  const page = await service.updatePage(req.params.id, req.body || {});
  return ok(res, page, "Page updated.");
});

const adminDeletePage = asyncHandler(async (req, res) => {
  const result = await service.deletePage(req.params.id);
  return ok(res, result, "Page deleted.");
});

module.exports = {
  publicListPages,
  publicGetPage,
  adminListPages,
  adminGetPage,
  adminCreatePage,
  adminUpdatePage,
  adminDeletePage
};
