const path = require("node:path");
const { HttpError } = require("../../common/http-error");
const { generateId } = require("../../common/identity");
const { env } = require("../../config/env");
const { convertToWebp } = require("../../common/image-utils");
const { sanitizeCmsHtml } = require("../../common/html-sanitizer");
const {
  readContentStore,
  writeContentStore
} = require("../../database/content-store");
const { readCatalogStore } = require("../../database/catalog-store");
const { addActivityLog } = require("../audit-logs/audit-logs.service");
const { getAllSettings } = require("../settings/settings.service");
const { toPublicCategory } = require("../categories/categories.model");
const { toPublicProductCard } = require("../products/products.model");
const {
  BLOG_STATUS,
  cloneDefaultContentStore,
  slugify,
  dedupeStringList,
  normalizeFaqItems,
  estimateReadingTimeMinutes,
  sanitizeBlogCategory,
  sanitizeAdminBlog,
  buildPublicBlogPath,
  isBlogPublished,
  toPublicBlogCard
} = require("./blogs.model");

function ensureContentStoreShape(store) {
  const defaults = cloneDefaultContentStore();
  let changed = false;

  if (!Array.isArray(store.blogCategories)) {
    store.blogCategories = defaults.blogCategories;
    changed = true;
  }
  if (!Array.isArray(store.blogs)) {
    store.blogs = [];
    changed = true;
  }

  const existingCategoryIds = new Set(store.blogCategories.map((category) => category.id));
  for (const category of defaults.blogCategories) {
    if (existingCategoryIds.has(category.id)) {
      continue;
    }
    store.blogCategories.push(category);
    changed = true;
  }

  return changed;
}

async function readNormalizedContentStore() {
  const store = await readContentStore();
  const changed = ensureContentStoreShape(store);
  if (changed) {
    await writeContentStore(store);
  }
  return store;
}

function normalizeBaseUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return env.publicBaseUrl.replace(/\/$/, "");
  }
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/$/, "");
  }
  return `https://${value.replace(/\/$/, "")}`;
}

function ensureUniqueBlogSlug(store, slug, ignoreBlogId = null) {
  const duplicate = store.blogs.find(
    (blog) => blog.id !== ignoreBlogId && blog.slug === slug
  );
  if (duplicate) {
    throw new HttpError(409, "Blog slug already exists.");
  }
}

function ensureBlogCategoryExists(store, categoryId) {
  const category = store.blogCategories.find(
    (row) => row.id === categoryId && row.isActive
  );
  if (!category) {
    throw new HttpError(400, "Invalid blog category.");
  }
  return category;
}

function ensureProductIdsExist(productIds, catalogStore) {
  const validIds = new Set(catalogStore.products.map((product) => product.id));
  for (const productId of productIds) {
    if (!validIds.has(productId)) {
      throw new HttpError(400, `Invalid linkedProductId: ${productId}`);
    }
  }
}

function ensureCategoryIdsExist(categoryIds, catalogStore) {
  const validIds = new Set(catalogStore.categories.map((category) => category.id));
  for (const categoryId of categoryIds) {
    if (!validIds.has(categoryId)) {
      throw new HttpError(400, `Invalid linkedCategoryId: ${categoryId}`);
    }
  }
}

function ensureRelatedBlogIdsExist(store, relatedBlogIds, currentBlogId = null) {
  const validIds = new Set(store.blogs.map((blog) => blog.id));
  for (const blogId of relatedBlogIds) {
    if (blogId === currentBlogId) {
      throw new HttpError(400, "Blog cannot relate to itself.");
    }
    if (!validIds.has(blogId)) {
      throw new HttpError(400, `Invalid relatedBlogId: ${blogId}`);
    }
  }
}

function normalizeBlogRecordInput(input, store, catalogStore, currentBlogId = null) {
  const tags = dedupeStringList(input.tags);
  const linkedProductIds = dedupeStringList(input.linkedProductIds);
  const linkedCategoryIds = dedupeStringList(input.linkedCategoryIds);
  const relatedBlogIds = dedupeStringList(input.relatedBlogIds);
  const faqItems = normalizeFaqItems(input.faqItems);

  ensureBlogCategoryExists(store, input.categoryId);
  ensureProductIdsExist(linkedProductIds, catalogStore);
  ensureCategoryIdsExist(linkedCategoryIds, catalogStore);
  ensureRelatedBlogIdsExist(store, relatedBlogIds, currentBlogId);

  return {
    tags,
    linkedProductIds,
    linkedCategoryIds,
    relatedBlogIds,
    faqItems
  };
}

function toCategoryMap(store) {
  return new Map(store.blogCategories.map((category) => [category.id, category]));
}

function toCatalogMaps(catalogStore) {
  return {
    productsById: new Map(catalogStore.products.map((product) => [product.id, product])),
    categoriesById: new Map(catalogStore.categories.map((category) => [category.id, category]))
  };
}

function buildSearchText(blog, categoryName) {
  return [
    blog.title,
    blog.slug,
    blog.excerpt,
    blog.content,
    categoryName,
    blog.author,
    ...(blog.tags || []),
    ...(blog.faqItems || []).flatMap((item) => [item.question, item.answer])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function listPublishedBlogsRows(store) {
  return store.blogs
    .filter((blog) => isBlogPublished(blog))
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt || b.updatedAt) - Date.parse(a.publishedAt || a.updatedAt)
    );
}

function buildRelatedProducts(linkedProductIds, productsById) {
  return linkedProductIds
    .map((productId) => productsById.get(productId))
    .filter((product) => product && product.isActive)
    .map((product) => toPublicProductCard(product));
}

function buildRelatedCategories(linkedCategoryIds, categoriesById) {
  return linkedCategoryIds
    .map((categoryId) => categoriesById.get(categoryId))
    .filter((category) => category && category.isActive)
    .map((category) => toPublicCategory(category));
}

function buildRelatedBlogs(currentBlog, publishedBlogs, categoryMap) {
  const rows = [];
  const added = new Set();

  for (const relatedId of currentBlog.relatedBlogIds || []) {
    const related = publishedBlogs.find((blog) => blog.id === relatedId);
    if (!related || related.id === currentBlog.id || added.has(related.id)) {
      continue;
    }
    rows.push(toPublicBlogCard(related, categoryMap.get(related.categoryId) || null));
    added.add(related.id);
  }

  if (rows.length >= 6) {
    return rows.slice(0, 6);
  }

  for (const blog of publishedBlogs) {
    if (blog.id === currentBlog.id || added.has(blog.id)) {
      continue;
    }
    if (blog.categoryId !== currentBlog.categoryId) {
      continue;
    }
    rows.push(toPublicBlogCard(blog, categoryMap.get(blog.categoryId) || null));
    added.add(blog.id);
    if (rows.length >= 6) {
      break;
    }
  }

  return rows;
}

function buildArticleJsonLd(blog, options) {
  const imageList = dedupeStringList([blog.ogImageUrl, blog.featuredImageUrl]).filter(Boolean);

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: blog.seoTitle || blog.title,
    description: blog.seoDescription || blog.excerpt,
    datePublished: blog.publishedAt,
    dateModified: blog.updatedAt,
    author: {
      "@type": "Person",
      name: blog.author
    },
    image: imageList,
    mainEntityOfPage: options.canonicalUrl,
    url: options.canonicalUrl,
    articleSection: options.categoryName || "",
    keywords: dedupeStringList(blog.tags).join(", "),
    publisher: {
      "@type": "Organization",
      name: options.storeName,
      logo: options.brandLogoUrl
        ? {
            "@type": "ImageObject",
            url: options.brandLogoUrl
          }
        : undefined
    }
  };
}

function buildFaqJsonLd(blog) {
  const faqItems = normalizeFaqItems(blog.faqItems);
  if (faqItems.length === 0) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };
}

async function listAdminBlogCategories() {
  const store = await readNormalizedContentStore();
  return [...store.blogCategories]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(sanitizeBlogCategory);
}

async function listPublicBlogCategories() {
  const store = await readNormalizedContentStore();
  const counts = new Map();

  for (const blog of listPublishedBlogsRows(store)) {
    counts.set(blog.categoryId, Number(counts.get(blog.categoryId) || 0) + 1);
  }

  return store.blogCategories
    .filter((category) => category.isActive)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((category) => ({
      ...sanitizeBlogCategory(category),
      publishedCount: Number(counts.get(category.id) || 0)
    }));
}

async function listAdminBlogs(filters) {
  const [store, catalogStore] = await Promise.all([
    readNormalizedContentStore(),
    readCatalogStore()
  ]);
  const categoryMap = toCategoryMap(store);
  const catalogMaps = toCatalogMaps(catalogStore);

  let rows = [...store.blogs];
  if (!filters.includeArchived) {
    rows = rows.filter((blog) => blog.status !== BLOG_STATUS.ARCHIVED);
  }
  if (filters.categoryId) {
    rows = rows.filter((blog) => blog.categoryId === filters.categoryId);
  }
  if (filters.status) {
    rows = rows.filter((blog) => blog.status === filters.status);
  }
  if (filters.q) {
    const query = filters.q.toLowerCase();
    rows = rows.filter((blog) =>
      buildSearchText(blog, categoryMap.get(blog.categoryId)?.name || "").includes(query)
    );
  }

  return rows
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, filters.limit)
    .map((blog) => ({
      ...sanitizeAdminBlog(blog),
      category: categoryMap.get(blog.categoryId)
        ? sanitizeBlogCategory(categoryMap.get(blog.categoryId))
        : null,
      linkedProductsCount: buildRelatedProducts(blog.linkedProductIds || [], catalogMaps.productsById)
        .length,
      linkedCategoriesCount: buildRelatedCategories(
        blog.linkedCategoryIds || [],
        catalogMaps.categoriesById
      ).length,
      readingTimeMinutes: estimateReadingTimeMinutes(blog.content)
    }));
}

async function getAdminBlogById(blogId) {
  const [store, catalogStore] = await Promise.all([
    readNormalizedContentStore(),
    readCatalogStore()
  ]);
  const categoryMap = toCategoryMap(store);
  const catalogMaps = toCatalogMaps(catalogStore);
  const blog = store.blogs.find((row) => row.id === blogId);
  if (!blog) {
    throw new HttpError(404, "Blog not found.");
  }

  return {
    ...sanitizeAdminBlog(blog),
    category: categoryMap.get(blog.categoryId)
      ? sanitizeBlogCategory(categoryMap.get(blog.categoryId))
      : null,
    linkedProducts: buildRelatedProducts(blog.linkedProductIds || [], catalogMaps.productsById),
    linkedCategories: buildRelatedCategories(
      blog.linkedCategoryIds || [],
      catalogMaps.categoriesById
    )
  };
}

async function createBlog(payload, actor) {
  const [store, catalogStore] = await Promise.all([
    readNormalizedContentStore(),
    readCatalogStore()
  ]);

  const slug = payload.slug ? slugify(payload.slug) : slugify(payload.title);
  ensureUniqueBlogSlug(store, slug);

  const normalized = normalizeBlogRecordInput(payload, store, catalogStore);
  const now = new Date().toISOString();
  const publishedAt =
    payload.status === BLOG_STATUS.PUBLISHED ? payload.publishedAt || now : null;

  const blog = {
    id: generateId("blog"),
    title: payload.title,
    slug,
    excerpt: payload.excerpt,
    content: sanitizeCmsHtml(payload.content),
    featuredImageUrl: payload.featuredImageUrl || "",
    youtubeUrl: payload.youtubeUrl || "",
    categoryId: payload.categoryId,
    tags: normalized.tags,
    author: payload.author,
    status: payload.status,
    publishedAt,
    seoTitle: payload.seoTitle || "",
    seoDescription: payload.seoDescription || "",
    canonicalUrl: payload.canonicalUrl || "",
    ogImageUrl: payload.ogImageUrl || "",
    linkedProductIds: normalized.linkedProductIds,
    linkedCategoryIds: normalized.linkedCategoryIds,
    relatedBlogIds: normalized.relatedBlogIds,
    faqItems: normalized.faqItems,
    createdAt: now,
    updatedAt: now
  };

  store.blogs.push(blog);
  await writeContentStore(store);

  await addActivityLog({
    action: "blogs.created",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "blog",
    resourceId: blog.id
  });

  return sanitizeAdminBlog(blog);
}

async function updateBlog(blogId, patch, actor) {
  const [store, catalogStore] = await Promise.all([
    readNormalizedContentStore(),
    readCatalogStore()
  ]);
  const index = store.blogs.findIndex((blog) => blog.id === blogId);
  if (index < 0) {
    throw new HttpError(404, "Blog not found.");
  }

  const current = store.blogs[index];
  const nextTitle = patch.title || current.title;
  const nextSlug = patch.slug ? slugify(patch.slug) : current.slug;
  ensureUniqueBlogSlug(store, nextSlug, blogId);

  const mergedInput = {
    categoryId: patch.categoryId || current.categoryId,
    tags: patch.tags === undefined ? current.tags : patch.tags,
    linkedProductIds:
      patch.linkedProductIds === undefined
        ? current.linkedProductIds
        : patch.linkedProductIds,
    linkedCategoryIds:
      patch.linkedCategoryIds === undefined
        ? current.linkedCategoryIds
        : patch.linkedCategoryIds,
    relatedBlogIds:
      patch.relatedBlogIds === undefined ? current.relatedBlogIds : patch.relatedBlogIds,
    faqItems: patch.faqItems === undefined ? current.faqItems : patch.faqItems
  };

  const normalized = normalizeBlogRecordInput(mergedInput, store, catalogStore, blogId);
  const nextStatus = patch.status || current.status;
  const nextPublishedAt =
    patch.publishedAt !== undefined ? patch.publishedAt : current.publishedAt;

  const next = {
    ...current,
    ...patch,
    title: nextTitle,
    slug: nextSlug,
    content: patch.content !== undefined ? sanitizeCmsHtml(patch.content) : current.content,
    categoryId: mergedInput.categoryId,
    tags: normalized.tags,
    linkedProductIds: normalized.linkedProductIds,
    linkedCategoryIds: normalized.linkedCategoryIds,
    relatedBlogIds: normalized.relatedBlogIds,
    faqItems: normalized.faqItems,
    status: nextStatus,
    publishedAt:
      nextStatus === BLOG_STATUS.PUBLISHED
        ? nextPublishedAt || current.publishedAt || new Date().toISOString()
        : null,
    updatedAt: new Date().toISOString()
  };

  store.blogs[index] = next;
  await writeContentStore(store);

  await addActivityLog({
    action: "blogs.updated",
    actorId: actor.id,
    actorRole: actor.role,
    resourceType: "blog",
    resourceId: blogId,
    metadata: {
      changedFields: Object.keys(patch)
    }
  });

  return sanitizeAdminBlog(next);
}

async function archiveBlog(blogId, actor) {
  return updateBlog(blogId, { status: BLOG_STATUS.ARCHIVED }, actor);
}

async function listPublicBlogs(filters) {
  const store = await readNormalizedContentStore();
  const categoryMap = toCategoryMap(store);
  let rows = listPublishedBlogsRows(store);

  if (filters.categoryId) {
    rows = rows.filter((blog) => blog.categoryId === filters.categoryId);
  }
  if (filters.tag) {
    const tag = filters.tag.toLowerCase();
    rows = rows.filter((blog) => (blog.tags || []).some((value) => value.toLowerCase() === tag));
  }
  if (filters.q) {
    const query = filters.q.toLowerCase();
    rows = rows.filter((blog) =>
      buildSearchText(blog, categoryMap.get(blog.categoryId)?.name || "").includes(query)
    );
  }

  return rows.slice(0, filters.limit).map((blog) =>
    toPublicBlogCard(blog, categoryMap.get(blog.categoryId) || null)
  );
}

async function getPublicBlogBySlug(slug) {
  const [store, catalogStore, settings] = await Promise.all([
    readNormalizedContentStore(),
    readCatalogStore(),
    getAllSettings()
  ]);

  const blog = store.blogs.find((row) => row.slug === slug && isBlogPublished(row));
  if (!blog) {
    throw new HttpError(404, "Blog not found.");
  }

  const categoryMap = toCategoryMap(store);
  const catalogMaps = toCatalogMaps(catalogStore);
  const baseUrl = normalizeBaseUrl(settings.seoDefaults.canonicalDomain || env.publicBaseUrl);
  const canonicalUrl = blog.canonicalUrl || `${baseUrl}${buildPublicBlogPath(blog.slug)}`;
  const category = categoryMap.get(blog.categoryId) || null;
  const relatedProducts = buildRelatedProducts(
    blog.linkedProductIds || [],
    catalogMaps.productsById
  );
  const relatedCategories = buildRelatedCategories(
    blog.linkedCategoryIds || [],
    catalogMaps.categoriesById
  );
  const relatedBlogs = buildRelatedBlogs(blog, listPublishedBlogsRows(store), categoryMap);

  const article = {
    ...toPublicBlogCard(blog, category),
    content: blog.content,
    youtubeUrl: blog.youtubeUrl || "",
    faqItems: normalizeFaqItems(blog.faqItems),
    seoTitle: blog.seoTitle || blog.title,
    seoDescription: blog.seoDescription || blog.excerpt,
    canonicalUrl,
    ogImageUrl: blog.ogImageUrl || blog.featuredImageUrl || ""
  };

  return {
    article,
    relatedProducts,
    relatedCategories,
    relatedBlogs,
    structuredData: {
      article: buildArticleJsonLd(blog, {
        canonicalUrl,
        categoryName: category?.name || "",
        storeName: settings.storeProfile.storeName || "Jenix India",
        brandLogoUrl: settings.branding.brandLogoUrl || ""
      }),
      faq: buildFaqJsonLd(blog)
    },
    cta: {
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`Need guidance for ${blog.title}`)}`,
      requestQuoteLabel: "Request Quote"
    }
  };
}

async function listHelpfulGuidesForProduct(product, limit = 4) {
  const store = await readNormalizedContentStore();
  const categoryMap = toCategoryMap(store);
  const validCategoryIds = new Set([product.categoryId, product.subcategoryId].filter(Boolean));

  return listPublishedBlogsRows(store)
    .filter((blog) => {
      const linkedProducts = dedupeStringList(blog.linkedProductIds);
      const linkedCategories = dedupeStringList(blog.linkedCategoryIds);
      if (linkedProducts.includes(product.id)) {
        return true;
      }
      return linkedCategories.some((categoryId) => validCategoryIds.has(categoryId));
    })
    .slice(0, limit)
    .map((blog) => {
      const category = categoryMap.get(blog.categoryId) || null;
      return toPublicBlogCard(blog, category);
    });
}

async function generateSitemapXml() {
  const [settings, catalogStore, contentStore] = await Promise.all([
    getAllSettings(),
    readCatalogStore(),
    readNormalizedContentStore()
  ]);

  if (!settings.seoDefaults.sitemapEnabled) {
    return null;
  }

  const baseUrl = normalizeBaseUrl(settings.seoDefaults.canonicalDomain || env.publicBaseUrl);
  const escapeXml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const urls = [{ loc: `${baseUrl}/`, lastmod: settings.meta.updatedAt }];

  for (const category of catalogStore.categories.filter((row) => row.isActive)) {
    urls.push({
      loc: `${baseUrl}/categories/${category.slug}`,
      lastmod: category.updatedAt
    });
  }

  for (const product of catalogStore.products.filter((row) => row.isActive)) {
    urls.push({
      loc: `${baseUrl}/products/${product.slug}`,
      lastmod: product.updatedAt
    });
  }

  for (const blog of listPublishedBlogsRows(contentStore)) {
    urls.push({
      loc: `${baseUrl}${buildPublicBlogPath(blog.slug)}`,
      lastmod: blog.updatedAt
    });
  }

  const rows = urls
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <lastmod>${escapeXml(entry.lastmod || new Date().toISOString())}</lastmod>\n  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>`;
}

function blogPublicUploadUrl(filePath) {
  const uploadsRoot = path.resolve(process.cwd(), env.uploadDir);
  const relativePath = path.relative(uploadsRoot, filePath).replace(/\\/g, "/");
  return `${env.publicBaseUrl}/static/uploads/${relativePath}`;
}

async function uploadBlogImage(blogId, filePath, imageType, actor) {
  const store = await readNormalizedContentStore();
  const index = store.blogs.findIndex((b) => b.id === blogId);
  if (index < 0) throw new HttpError(404, "Blog not found.");

  let mainPath = filePath;
  try {
    const result = await convertToWebp(filePath);
    mainPath = result.mainPath;
  } catch {
    // keep original if sharp unavailable
  }

  const imageUrl = blogPublicUploadUrl(mainPath);
  const blog = store.blogs[index];

  if (imageType === "og") {
    blog.ogImageUrl = imageUrl;
  } else {
    blog.featuredImageUrl = imageUrl;
  }
  blog.updatedAt = new Date().toISOString();
  store.blogs[index] = blog;
  await writeContentStore(store);

  await addActivityLog({
    action: "blogs.image.uploaded",
    actorId: actor?.id,
    actorRole: actor?.role,
    resourceType: "blog",
    resourceId: blogId,
    metadata: { imageType }
  });

  return sanitizeAdminBlog(blog);
}

module.exports = {
  listAdminBlogCategories,
  listPublicBlogCategories,
  listAdminBlogs,
  getAdminBlogById,
  createBlog,
  updateBlog,
  archiveBlog,
  uploadBlogImage,
  listPublicBlogs,
  getPublicBlogBySlug,
  listHelpfulGuidesForProduct,
  generateSitemapXml
};
