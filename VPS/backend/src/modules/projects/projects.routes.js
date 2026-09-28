const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { env } = require("../../config/env");
const { requireAdminAuth } = require("../../middlewares/require-admin-auth");
const { requireAdminPermission } = require("../../middlewares/require-admin-permission");
// Projects are content pages, so they use the existing Blogs / Knowledge
// permissions (no change to the shared roles model).
const { BLOG_PERMISSIONS } = require("../blogs/blogs.permissions");
const controller = require("./projects.controller");

const projectUploadsRoot = path.resolve(process.cwd(), env.uploadDir, "projects");
fs.mkdirSync(projectUploadsRoot, { recursive: true });

const projectImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, projectUploadsRoot),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`)
  }),
  limits: { fileSize: env.maxUploadSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed."));
    return cb(null, true);
  }
});

function createAdminProjectsRouter() {
  const router = express.Router();
  router.use(requireAdminAuth);
  router.get("/", requireAdminPermission(BLOG_PERMISSIONS.VIEW), controller.adminListProjects);
  router.get("/enquiries", requireAdminPermission(BLOG_PERMISSIONS.VIEW), controller.adminListEnquiries);
  router.patch("/enquiries/:enquiryId", requireAdminPermission(BLOG_PERMISSIONS.EDIT), controller.adminUpdateEnquiry);
  router.post("/image", requireAdminPermission(BLOG_PERMISSIONS.EDIT), projectImageUpload.single("file"), controller.adminUploadProjectImage);
  router.get("/:projectId", requireAdminPermission(BLOG_PERMISSIONS.VIEW), controller.adminGetProject);
  router.post("/", requireAdminPermission(BLOG_PERMISSIONS.CREATE), controller.adminCreateProject);
  router.patch("/:projectId", requireAdminPermission(BLOG_PERMISSIONS.EDIT), controller.adminUpdateProject);
  router.delete("/:projectId", requireAdminPermission(BLOG_PERMISSIONS.DELETE), controller.adminArchiveProject);
  return router;
}

function createPublicProjectsRouter() {
  const router = express.Router();
  router.get("/", controller.publicListProjects);
  router.get("/:slug", controller.publicGetProject);
  router.post("/:slug/enquiry", controller.publicCreateEnquiry);
  return router;
}

module.exports = { createAdminProjectsRouter, createPublicProjectsRouter };
