const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./blogs.service");
const {
  parseListAdminBlogsQuery,
  parseListPublicBlogsQuery,
  parseCreateBlogPayload,
  parseUpdateBlogPayload
} = require("./blogs.validator");

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

const adminListBlogCategories = asyncHandler(async (_req, res) => {
  const data = await service.listAdminBlogCategories();
  return ok(res, data, "Blog categories fetched.");
});

const adminListBlogs = asyncHandler(async (req, res) => {
  const query = parseListAdminBlogsQuery(req.query || {});
  const data = await service.listAdminBlogs(query);
  return ok(res, data, "Blogs fetched.");
});

const adminGetBlog = asyncHandler(async (req, res) => {
  const data = await service.getAdminBlogById(req.params.blogId);
  return ok(res, data, "Blog fetched.");
});

const adminCreateBlog = asyncHandler(async (req, res) => {
  const payload = parseCreateBlogPayload(req.body);
  const data = await service.createBlog(payload, req.actor);
  return created(res, data, "Blog created.");
});

const adminUpdateBlog = asyncHandler(async (req, res) => {
  const patch = parseUpdateBlogPayload(req.body);
  const data = await service.updateBlog(req.params.blogId, patch, req.actor);
  return ok(res, data, "Blog updated.");
});

const adminArchiveBlog = asyncHandler(async (req, res) => {
  const data = await service.archiveBlog(req.params.blogId, req.actor);
  return ok(res, data, "Blog archived.");
});

const publicListBlogCategories = asyncHandler(async (_req, res) => {
  const data = await service.listPublicBlogCategories();
  return ok(res, data, "Public blog categories fetched.");
});

const publicListBlogs = asyncHandler(async (req, res) => {
  const query = parseListPublicBlogsQuery(req.query || {});
  const data = await service.listPublicBlogs(query);
  return ok(res, data, "Public blogs fetched.");
});

const publicGetBlog = asyncHandler(async (req, res) => {
  const data = await service.getPublicBlogBySlug(req.params.slug);
  return ok(res, data, "Public blog fetched.");
});

const publicSitemap = asyncHandler(async (_req, res) => {
  const xml = await service.generateSitemapXml();
  if (!xml) {
    throw new HttpError(404, "Sitemap is disabled.");
  }

  res.type("application/xml");
  res.status(200).send(xml);
});

module.exports = {
  adminListBlogCategories,
  adminListBlogs,
  adminGetBlog,
  adminCreateBlog,
  adminUpdateBlog,
  adminArchiveBlog,
  publicListBlogCategories,
  publicListBlogs,
  publicGetBlog,
  publicSitemap
};
