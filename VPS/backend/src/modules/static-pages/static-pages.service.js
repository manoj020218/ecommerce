const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { sanitizeCmsHtml } = require("../../common/html-sanitizer");
const {
  readStaticPagesStore,
  writeStaticPagesStore
} = require("../../database/static-pages-store");

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function listPages(onlyPublished = false) {
  const store = await readStaticPagesStore();
  const pages = store.pages || [];
  return onlyPublished
    ? pages.filter((p) => p.isPublished).map(toPublicPage)
    : pages.map(toAdminPage);
}

async function getPageBySlug(slug, adminMode = false) {
  const store = await readStaticPagesStore();
  const page = (store.pages || []).find((p) => p.slug === slug);
  if (!page) throw new HttpError(404, "Page not found.");
  if (!adminMode && !page.isPublished) throw new HttpError(404, "Page not found.");
  return adminMode ? toAdminPage(page) : toPublicPage(page);
}

async function getPageById(id) {
  const store = await readStaticPagesStore();
  const page = (store.pages || []).find((p) => p.id === id);
  if (!page) throw new HttpError(404, "Page not found.");
  return toAdminPage(page);
}

async function createPage(payload) {
  const store = await readStaticPagesStore();
  const slug = payload.slug ? slugify(payload.slug) : slugify(payload.title);
  if (!slug) throw new HttpError(400, "Title or slug is required.");

  const duplicate = (store.pages || []).find((p) => p.slug === slug);
  if (duplicate) throw new HttpError(409, `A page with slug "${slug}" already exists.`);

  const now = new Date().toISOString();
  const page = {
    id: generateId("page"),
    slug,
    title: String(payload.title || "").trim(),
    metaTitle: String(payload.metaTitle || "").trim(),
    metaDescription: String(payload.metaDescription || "").trim(),
    content: sanitizeCmsHtml(String(payload.content || "").trim()),
    isPublished: payload.isPublished !== false,
    isDefault: false,
    showInFooter: payload.showInFooter === true,
    createdAt: now,
    updatedAt: now
  };

  store.pages = [...(store.pages || []), page];
  await writeStaticPagesStore(store);
  return toAdminPage(page);
}

async function updatePage(id, payload) {
  const store = await readStaticPagesStore();
  const index = (store.pages || []).findIndex((p) => p.id === id);
  if (index === -1) throw new HttpError(404, "Page not found.");

  const existing = store.pages[index];

  let newSlug = existing.slug;
  if (payload.slug !== undefined) {
    const proposed = slugify(payload.slug);
    if (proposed && proposed !== existing.slug) {
      const duplicate = store.pages.find((p) => p.id !== id && p.slug === proposed);
      if (duplicate) throw new HttpError(409, `Slug "${proposed}" is already taken.`);
      newSlug = proposed;
    }
  }

  const updated = {
    ...existing,
    slug: newSlug,
    title: payload.title !== undefined ? String(payload.title).trim() : existing.title,
    metaTitle: payload.metaTitle !== undefined ? String(payload.metaTitle).trim() : existing.metaTitle,
    metaDescription: payload.metaDescription !== undefined ? String(payload.metaDescription).trim() : existing.metaDescription,
    content:
      payload.content !== undefined
        ? sanitizeCmsHtml(String(payload.content).trim())
        : existing.content,
    isPublished: payload.isPublished !== undefined ? Boolean(payload.isPublished) : existing.isPublished,
    showInFooter: payload.showInFooter !== undefined ? Boolean(payload.showInFooter) : existing.showInFooter,
    updatedAt: new Date().toISOString()
  };

  store.pages[index] = updated;
  await writeStaticPagesStore(store);
  return toAdminPage(updated);
}

async function deletePage(id) {
  const store = await readStaticPagesStore();
  const page = (store.pages || []).find((p) => p.id === id);
  if (!page) throw new HttpError(404, "Page not found.");
  if (page.isDefault) throw new HttpError(400, "Default pages cannot be deleted. You can unpublish them instead.");

  store.pages = store.pages.filter((p) => p.id !== id);
  await writeStaticPagesStore(store);
  return { deleted: true };
}

function toAdminPage(page) {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    metaTitle: page.metaTitle || "",
    metaDescription: page.metaDescription || "",
    content: page.content || "",
    isPublished: page.isPublished !== false,
    isDefault: page.isDefault === true,
    showInFooter: page.showInFooter === true,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt
  };
}

function toPublicPage(page) {
  return {
    slug: page.slug,
    title: page.title,
    metaTitle: page.metaTitle || page.title,
    metaDescription: page.metaDescription || "",
    content: page.content || "",
    showInFooter: page.showInFooter === true,
    updatedAt: page.updatedAt
  };
}

module.exports = { listPages, getPageBySlug, getPageById, createPage, updatePage, deletePage };
