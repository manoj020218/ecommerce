const BLOG_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived"
});

const DEFAULT_BLOG_CATEGORY_NAMES = Object.freeze([
  "CCTV & Surveillance Guide",
  "Smart Door Lock Guide",
  "Gate Automation Guide",
  "Access Control Guide",
  "Networking / 4G Router Guide",
  "Smart Home Guide",
  "Parking System Guide",
  "QR Unlock / Video Doorbell Guide",
  "Installation Guide",
  "Buying Guide",
  "Troubleshooting Guide"
]);

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createDefaultBlogCategories() {
  const now = new Date().toISOString();
  return DEFAULT_BLOG_CATEGORY_NAMES.map((name) => {
    const slug = slugify(name);
    return {
      id: `blogcat_${slug}`,
      name,
      slug,
      description: `${name} content for Jenix knowledge base.`,
      isActive: true,
      isSystem: true,
      createdAt: now,
      updatedAt: now
    };
  });
}

const DEFAULT_CONTENT_STORE = Object.freeze({
  blogCategories: createDefaultBlogCategories(),
  blogs: []
});

function cloneDefaultContentStore() {
  return JSON.parse(JSON.stringify(DEFAULT_CONTENT_STORE));
}

function dedupeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeFaqItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      question: String(item.question || "").trim(),
      answer: String(item.answer || "").trim()
    }))
    .filter((item) => item.question && item.answer);
}

function estimateReadingTimeMinutes(content) {
  const words = String(content || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  if (words <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(words / 220));
}

function sanitizeBlogCategory(category) {
  return { ...category };
}

function buildPublicBlogPath(slug) {
  return `/guides/${slug}`;
}

function isBlogPublished(blog) {
  if (!blog || blog.status !== BLOG_STATUS.PUBLISHED) {
    return false;
  }

  if (!blog.publishedAt) {
    return false;
  }

  return Date.parse(blog.publishedAt) <= Date.now();
}

function toPublicBlogCard(blog, category) {
  return {
    id: blog.id,
    title: blog.title,
    slug: blog.slug,
    excerpt: blog.excerpt,
    featuredImageUrl: blog.featuredImageUrl || "",
    category: category
      ? {
          id: category.id,
          name: category.name,
          slug: category.slug
        }
      : null,
    tags: dedupeStringList(blog.tags),
    author: blog.author,
    publishedAt: blog.publishedAt,
    updatedAt: blog.updatedAt,
    readingTimeMinutes: estimateReadingTimeMinutes(blog.content),
    publicPath: buildPublicBlogPath(blog.slug)
  };
}

function sanitizeAdminBlog(blog) {
  return {
    ...blog,
    tags: dedupeStringList(blog.tags),
    linkedProductIds: dedupeStringList(blog.linkedProductIds),
    linkedCategoryIds: dedupeStringList(blog.linkedCategoryIds),
    relatedBlogIds: dedupeStringList(blog.relatedBlogIds),
    faqItems: normalizeFaqItems(blog.faqItems)
  };
}

module.exports = {
  BLOG_STATUS,
  DEFAULT_BLOG_CATEGORY_NAMES,
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
};
