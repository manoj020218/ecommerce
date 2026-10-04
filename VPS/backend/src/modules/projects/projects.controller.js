const { ZodError } = require("zod");
const { HttpError } = require("../../common/http-error");
const { ok, created } = require("../../common/http-response");
const service = require("./projects.service");
const { recordProjectView } = require("./project-views.service");
const {
  parseCreateProject,
  parseUpdateProject,
  parseCreateEnquiry,
  parseUpdateEnquiry
} = require("./projects.validator");

function mapValidationError(error) {
  if (error instanceof ZodError) {
    // First issue's message, so the buyer sees e.g. "Please enter a valid mobile number"
    const first = error.issues?.[0];
    return new HttpError(400, first?.message || "Validation failed.", { issues: error.issues });
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

// public
const publicListProjects = asyncHandler(async (_req, res) => ok(res, await service.listPublicProjects(), "Projects fetched."));
// const publicGetProject = asyncHandler(async (req, res) => ok(res, await service.getPublicProject(req.params.slug), "Project fetched."));
const publicGetProject = asyncHandler(async (req, res) => {
  const data = await service.getPublicProject(req.params.slug);
  // Admin → Projects "Visits" — the storefront project page calls this once
  // per view. In-memory counter, never blocks/throws.
  recordProjectView(data?.id, req);
  return ok(res, data, "Project fetched.");
});
const publicCreateEnquiry = asyncHandler(async (req, res) => {
  const payload = parseCreateEnquiry(req.body);
  const data = await service.createEnquiry(req.params.slug, payload);
  return created(res, data, "Thank you — we will contact you shortly.");
});

// admin
const adminListProjects = asyncHandler(async (_req, res) => ok(res, await service.listAdminProjects(), "Projects fetched."));
const adminGetProject = asyncHandler(async (req, res) => ok(res, await service.getAdminProject(req.params.projectId), "Project fetched."));
const adminCreateProject = asyncHandler(async (req, res) =>
  created(res, await service.createProject(parseCreateProject(req.body), req.actor), "Project created."));
const adminUpdateProject = asyncHandler(async (req, res) =>
  ok(res, await service.updateProject(req.params.projectId, parseUpdateProject(req.body), req.actor), "Project updated."));
const adminArchiveProject = asyncHandler(async (req, res) =>
  ok(res, await service.archiveProject(req.params.projectId, req.actor), "Project unpublished."));
const adminUploadProjectImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Image file is required.");
  return ok(res, await service.uploadProjectImage(req.file.path), "Image uploaded.");
});
const adminListEnquiries = asyncHandler(async (req, res) =>
  ok(res, await service.listAdminEnquiries({ projectId: req.query.projectId || "", status: req.query.status || "" }), "Enquiries fetched."));
const adminUpdateEnquiry = asyncHandler(async (req, res) =>
  ok(res, await service.updateEnquiry(req.params.enquiryId, parseUpdateEnquiry(req.body), req.actor), "Enquiry updated."));

module.exports = {
  publicListProjects,
  publicGetProject,
  publicCreateEnquiry,
  adminListProjects,
  adminGetProject,
  adminCreateProject,
  adminUpdateProject,
  adminArchiveProject,
  adminUploadProjectImage,
  adminListEnquiries,
  adminUpdateEnquiry
};
