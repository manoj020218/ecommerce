const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { readCatalogStore, writeCatalogStore } = require("../../database/catalog-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { sanitizeCategory, toPublicCategory } = require("./categories.model");
const { convertToWebp } = require("../../common/image-utils");
const { env } = require("../../config/env");

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortCategories(items) {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.name.localeCompare(b.name);
  });
}

function ensureUniqueCategory(store, name, slug, ignoreCategoryId = null) {
  const duplicate = store.categories.find(
    (category) =>
      category.id !== ignoreCategoryId &&
      (category.name.toLowerCase() === name.toLowerCase() || category.slug === slug)
  );

  if (duplicate) {
    throw new HttpError(409, "Category name or slug already exists.");
  }
}

function ensureParentValid(store, parentCategoryId, currentCategoryId = null) {
  if (!parentCategoryId) {
    return;
  }

  if (parentCategoryId === currentCategoryId) {
    throw new HttpError(400, "Category cannot be parent of itself.");
  }

  const parent = store.categories.find((category) => category.id === parentCategoryId);
  if (!parent) {
    throw new HttpError(400, "Invalid parentCategoryId.");
  }
}

async function listAdminCategories(filters) {
  const store = await readCatalogStore();
  let items = [...store.categories];

  if (!filters.includeInactive) {
    items = items.filter((category) => category.isActive);
  }

  if (filters.parentCategoryId) {
    items = items.filter(
      (category) => (category.parentCategoryId || null) === filters.parentCategoryId
    );
  }

  if (filters.q) {
    const query = filters.q.toLowerCase();
    items = items.filter(
      (category) =>
        category.name.toLowerCase().includes(query) ||
        category.slug.toLowerCase().includes(query)
    );
  }

  return sortCategories(items).map(sanitizeCategory);
}

async function listPublicCategories() {
  const store = await readCatalogStore();
  return sortCategories(store.categories.filter((category) => category.isActive)).map(
    toPublicCategory
  );
}

async function getCategoryById(categoryId) {
  const store = await readCatalogStore();
  const category = store.categories.find((item) => item.id === categoryId);
  if (!category) {
    throw new HttpError(404, "Category not found.");
  }
  return sanitizeCategory(category);
}

async function createCategory(payload, actor) {
  const store = await readCatalogStore();
  const slug = payload.slug ? slugify(payload.slug) : slugify(payload.name);

  ensureUniqueCategory(store, payload.name, slug);
  ensureParentValid(store, payload.parentCategoryId || null);

  const now = new Date().toISOString();
  const category = {
    id: generateId("cat"),
    name: payload.name,
    slug,
    parentCategoryId: payload.parentCategoryId || null,
    description: payload.description || "",
    imageUrl: payload.imageUrl || "",
    isActive: payload.isActive,
    sortOrder: payload.sortOrder,
    createdAt: now,
    updatedAt: now
  };

  store.categories.push(category);
  await writeCatalogStore(store);

  await addActivityLog({
    action: "categories.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "category",
    resourceId: category.id
  });

  return sanitizeCategory(category);
}

async function updateCategory(categoryId, patch, actor) {
  const store = await readCatalogStore();
  const index = store.categories.findIndex((category) => category.id === categoryId);
  if (index < 0) {
    throw new HttpError(404, "Category not found.");
  }

  const current = store.categories[index];
  const nextName = patch.name || current.name;
  const nextSlug = patch.slug ? slugify(patch.slug) : current.slug;
  const nextParentCategoryId =
    patch.parentCategoryId === undefined
      ? current.parentCategoryId
      : patch.parentCategoryId || null;

  ensureUniqueCategory(store, nextName, nextSlug, categoryId);
  ensureParentValid(store, nextParentCategoryId, categoryId);

  const next = {
    ...current,
    ...patch,
    name: nextName,
    slug: nextSlug,
    parentCategoryId: nextParentCategoryId,
    updatedAt: new Date().toISOString()
  };

  store.categories[index] = next;
  await writeCatalogStore(store);

  await addActivityLog({
    action: "categories.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "category",
    resourceId: next.id,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return sanitizeCategory(next);
}

async function archiveCategory(categoryId, actor) {
  const store = await readCatalogStore();
  const index = store.categories.findIndex((category) => category.id === categoryId);
  if (index < 0) {
    throw new HttpError(404, "Category not found.");
  }

  const hasActiveChildren = store.categories.some(
    (category) =>
      category.parentCategoryId === categoryId &&
      category.id !== categoryId &&
      category.isActive
  );
  if (hasActiveChildren) {
    throw new HttpError(
      400,
      "Cannot archive category while active child categories exist."
    );
  }

  store.categories[index] = {
    ...store.categories[index],
    isActive: false,
    updatedAt: new Date().toISOString()
  };

  await writeCatalogStore(store);

  await addActivityLog({
    action: "categories.archived",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "category",
    resourceId: categoryId
  });

  return sanitizeCategory(store.categories[index]);
}

function publicBaseUploadUrl(filePath) {
  const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);
  const relativePath = path.relative(uploadsRoot, filePath).replace(/\\/g, "/");
  return `${env.publicBaseUrl}/static/uploads/${relativePath}`;
}

async function uploadCategoryImage(categoryId, filePath, actor) {
  const store = await readCatalogStore();
  const index = store.categories.findIndex((c) => c.id === categoryId);
  if (index < 0) throw new HttpError(404, "Category not found.");

  let mainPath = filePath;
  try {
    const result = await convertToWebp(filePath);
    mainPath = result.mainPath;
  } catch {
    // keep original if sharp unavailable
  }

  const imageUrl = publicBaseUploadUrl(mainPath);

  store.categories[index] = {
    ...store.categories[index],
    imageUrl,
    updatedAt: new Date().toISOString()
  };

  await writeCatalogStore(store);

  await addActivityLog({
    action: "categories.image.uploaded",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "category",
    resourceId: categoryId,
    metadata: { imageUrl }
  });

  return sanitizeCategory(store.categories[index]);
}

module.exports = {
  listAdminCategories,
  listPublicCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  archiveCategory,
  uploadCategoryImage
};
