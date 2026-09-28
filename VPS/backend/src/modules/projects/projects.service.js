const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const { readProjectsStore, writeProjectsStore } = require("../../database/projects-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { getAllSettings } = require("../settings/settings.service");
const { sanitizeProject, sanitizeProjectCard, sanitizeEnquiry, ensureArray } = require("./projects.model");

function nowIso() {
  return new Date().toISOString();
}

function findProject(store, idOrSlug) {
  return store.projects.find((p) => p.id === idOrSlug || p.slug === idOrSlug) || null;
}

// ─── public ────────────────────────────────────────────────────────────────
async function listPublicProjects() {
  const store = await readProjectsStore();
  return store.projects
    .filter((p) => p.isPublished)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map(sanitizeProjectCard);
}

async function getPublicProject(slug) {
  const store = await readProjectsStore();
  const project = store.projects.find((p) => p.slug === slug && p.isPublished);
  if (!project) throw new HttpError(404, "Project not found.");
  return sanitizeProject(project);
}

// ─── admin: projects ───────────────────────────────────────────────────────
async function listAdminProjects() {
  const store = await readProjectsStore();
  return store.projects
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((p) => ({
      ...sanitizeProject(p),
      enquiryCount: store.enquiries.filter((e) => e.projectId === p.id).length,
      newEnquiryCount: store.enquiries.filter((e) => e.projectId === p.id && (e.status || "new") === "new").length
    }));
}

async function getAdminProject(projectId) {
  const store = await readProjectsStore();
  const project = findProject(store, projectId);
  if (!project) throw new HttpError(404, "Project not found.");
  return sanitizeProject(project);
}

function assertSlugFree(store, slug, exceptId) {
  if (store.projects.some((p) => p.slug === slug && p.id !== exceptId)) {
    throw new HttpError(409, "Another project already uses this URL (slug).");
  }
}

async function createProject(payload, actor) {
  const store = await readProjectsStore();
  assertSlugFree(store, payload.slug, null);
  const now = nowIso();
  const project = sanitizeProject({ ...payload, id: generateId("project"), createdAt: now, updatedAt: now });
  store.projects.push(project);
  await writeProjectsStore(store);
  await addActivityLog({ action: "projects.created", actorId: actor?.id || "system", actorRole: actor?.role || "system", resourceType: "project", resourceId: project.id });
  return project;
}

async function updateProject(projectId, patch, actor) {
  const store = await readProjectsStore();
  const index = store.projects.findIndex((p) => p.id === projectId);
  if (index < 0) throw new HttpError(404, "Project not found.");
  if (patch.slug !== undefined) assertSlugFree(store, patch.slug, projectId);
  const next = sanitizeProject({ ...store.projects[index], ...patch, id: projectId, updatedAt: nowIso() });
  store.projects[index] = next;
  await writeProjectsStore(store);
  await addActivityLog({ action: "projects.updated", actorId: actor?.id || "system", actorRole: actor?.role || "system", resourceType: "project", resourceId: projectId });
  return next;
}

// Unpublish rather than delete: enquiries keep their link to the project.
async function archiveProject(projectId, actor) {
  return updateProject(projectId, { isPublished: false }, actor);
}

function toPublicUploadUrl(filePath) {
  const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);
  const relativePath = path.relative(uploadsRoot, filePath).replace(/\\/g, "/");
  return `${env.publicBaseUrl}/static/uploads/${relativePath}`;
}

// Returns the URL only; the admin editor decides where it goes (hero/gallery).
async function uploadProjectImage(filePath) {
  return { url: toPublicUploadUrl(filePath) };
}

// ─── enquiries ─────────────────────────────────────────────────────────────
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildEnquiryDetails(enquiry) {
  const rows = [
    ["Project", enquiry.projectTitle],
    ["Package of interest", enquiry.packageInterest || "Not sure yet"],
    ["Company / building", enquiry.company],
    ["City", enquiry.city],
    ...enquiry.answers.map((a) => [a.question, a.answer]),
    ["Message", enquiry.message]
  ].filter(([, v]) => v);
  return {
    html:
      `<table style="width:100%;font-size:13px;border-collapse:collapse;margin:12px 0;">` +
      rows.map(([k, v]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:40%;">${esc(k)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-weight:600;">${esc(v)}</td></tr>`).join("") +
      `</table>`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n")
  };
}

async function notifyEnquiry(enquiry) {
  try {
    // Lazy require: marketing.service pulls in a large dependency tree.
    const { safeSendTemplateNotification } = require("../marketing/marketing.service");
    const settings = await getAllSettings();
    const profile = settings.storeProfile || {};
    const details = buildEnquiryDetails(enquiry);
    const variables = {
      customerName: enquiry.name,
      customerMobile: enquiry.mobile,
      customerEmail: enquiry.email,
      productName: enquiry.projectTitle,
      itemsTable: details.html,
      cartItems: details.text
    };
    const base = { relatedResourceType: "project_enquiry", relatedResourceId: enquiry.id, variables };
    // Sequential: each send appends to the same notification log file.
    if (profile.supportEmail) {
      await safeSendTemplateNotification({ ...base, templateKey: "project_enquiry_admin", toEmail: profile.supportEmail });
    }
    const adminMobile = profile.supportWhatsApp || profile.supportMobile;
    if (adminMobile) {
      await safeSendTemplateNotification({ ...base, templateKey: "project_enquiry_admin_whatsapp", toMobile: adminMobile });
    }
    if (enquiry.email) {
      await safeSendTemplateNotification({ ...base, templateKey: "project_enquiry_received", toEmail: enquiry.email });
    }
  } catch (_error) {
    // Alerts are best-effort; the enquiry is already saved.
  }
}

async function createEnquiry(slug, payload) {
  const store = await readProjectsStore();
  const project = store.projects.find((p) => p.slug === slug && p.isPublished);
  if (!project) throw new HttpError(404, "Project not found.");

  // Light spam guard: same mobile, same project, within 10 minutes → treat as a
  // double submit and return the existing enquiry instead of a duplicate.
  const mobileDigits = String(payload.mobile).replace(/[^\d]/g, "");
  const recent = store.enquiries.find(
    (e) => e.projectId === project.id &&
      String(e.mobile).replace(/[^\d]/g, "") === mobileDigits &&
      Date.now() - Date.parse(e.createdAt || 0) < 10 * 60 * 1000
  );
  if (recent) return { id: recent.id, duplicate: true };

  const allowedQuestions = new Set(ensureArray(project.enquiryQuestions));
  const now = nowIso();
  const enquiry = sanitizeEnquiry({
    id: generateId("project_enquiry"),
    projectId: project.id,
    projectSlug: project.slug,
    projectTitle: project.title,
    name: payload.name,
    mobile: payload.mobile,
    email: payload.email || "",
    company: payload.company || "",
    city: payload.city,
    packageInterest: ensureArray(project.packages).some((pk) => pk.name === payload.packageInterest) ? payload.packageInterest : "",
    answers: ensureArray(payload.answers).filter((a) => allowedQuestions.has(a.question) && a.answer),
    message: payload.message || "",
    status: "new",
    createdAt: now,
    updatedAt: now
  });
  store.enquiries.push(enquiry);
  await writeProjectsStore(store);
  await notifyEnquiry(enquiry);
  return { id: enquiry.id, duplicate: false };
}

async function listAdminEnquiries(filters = {}) {
  const store = await readProjectsStore();
  return store.enquiries
    .filter((e) => !filters.projectId || e.projectId === filters.projectId)
    .filter((e) => !filters.status || (e.status || "new") === filters.status)
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .map(sanitizeEnquiry);
}

async function updateEnquiry(enquiryId, patch, actor) {
  const store = await readProjectsStore();
  const index = store.enquiries.findIndex((e) => e.id === enquiryId);
  if (index < 0) throw new HttpError(404, "Enquiry not found.");
  const next = sanitizeEnquiry({ ...store.enquiries[index], ...patch, updatedAt: nowIso() });
  store.enquiries[index] = next;
  await writeProjectsStore(store);
  await addActivityLog({ action: "projects.enquiry_updated", actorId: actor?.id || "system", actorRole: actor?.role || "system", resourceType: "project_enquiry", resourceId: enquiryId });
  return next;
}

module.exports = {
  listPublicProjects,
  getPublicProject,
  listAdminProjects,
  getAdminProject,
  createProject,
  updateProject,
  archiveProject,
  uploadProjectImage,
  createEnquiry,
  listAdminEnquiries,
  updateEnquiry
};
