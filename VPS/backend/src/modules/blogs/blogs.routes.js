const express = require("express");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { BLOG_PERMISSIONS } = require("./blogs.permissions");
const controller = require("./blogs.controller");

function createAdminBlogsRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);

  router.get(
    "/categories",
    requireAdminPermission(BLOG_PERMISSIONS.VIEW),
    controller.adminListBlogCategories
  );
  router.get(
    "/",
    requireAdminPermission(BLOG_PERMISSIONS.VIEW),
    controller.adminListBlogs
  );
  router.get(
    "/:blogId",
    requireAdminPermission(BLOG_PERMISSIONS.VIEW),
    controller.adminGetBlog
  );
  router.post(
    "/",
    requireAdminPermission(BLOG_PERMISSIONS.CREATE),
    controller.adminCreateBlog
  );
  router.patch(
    "/:blogId",
    requireAdminPermission(BLOG_PERMISSIONS.EDIT),
    controller.adminUpdateBlog
  );
  router.delete(
    "/:blogId",
    requireAdminPermission(BLOG_PERMISSIONS.DELETE),
    controller.adminArchiveBlog
  );

  return router;
}

function createPublicBlogsRouter() {
  const router = express.Router();

  router.get("/categories", controller.publicListBlogCategories);
  router.get("/", controller.publicListBlogs);
  router.get("/:slug", controller.publicGetBlog);

  return router;
}

module.exports = { createAdminBlogsRouter, createPublicBlogsRouter };
