const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const {
  requireAdminPermission
} = require("../../middlewares/require-admin-permission");
const { BLOG_PERMISSIONS } = require("./blogs.permissions");
const controller = require("./blogs.controller");

const blogUploadsRoot = path.resolve(process.cwd(), env.uploadDir, "blogs");
fs.mkdirSync(blogUploadsRoot, { recursive: true });

const blogImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, blogUploadsRoot),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: env.maxUploadSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed."));
      return;
    }
    cb(null, true);
  }
});

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

  router.post(
    "/:blogId/image",
    requireAdminPermission(BLOG_PERMISSIONS.EDIT),
    blogImageUpload.single("file"),
    controller.adminUploadBlogImage
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
