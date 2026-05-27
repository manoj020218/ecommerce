const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { BLOG_STATUS } = require("./blogs.model");

const faqItemSchema = z.object({
  question: z.string().trim().min(5).max(240),
  answer: z.string().trim().min(5).max(4000)
});

const stringIdListSchema = z
  .array(z.string().trim().min(2).max(160))
  .max(100)
  .transform((values) => [...new Set(values)]);

const blogStatusSchema = z.enum([
  BLOG_STATUS.DRAFT,
  BLOG_STATUS.PUBLISHED,
  BLOG_STATUS.ARCHIVED
]);

const optionalTextSchema = z.string().trim().optional().default("");

const listAdminBlogsQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  categoryId: z.string().trim().max(160).optional().default(""),
  status: z.string().trim().max(40).optional().default(""),
  includeArchived: z.coerce.boolean().optional().default(true),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100)
});

const listPublicBlogsQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  categoryId: z.string().trim().max(160).optional().default(""),
  tag: z.string().trim().max(120).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24)
});

const createBlogSchema = z.object({
  title: z.string().trim().min(5).max(220),
  slug: z.string().trim().min(2).max(220).optional(),
  excerpt: z.string().trim().min(10).max(600),
  content: z.string().trim().min(20).max(120000),
  featuredImageUrl: optionalTextSchema,
  categoryId: z.string().trim().min(2).max(160),
  tags: z.array(z.string().trim().min(2).max(80)).optional().default([]),
  author: z.string().trim().min(2).max(120).optional().default("Jenix India Team"),
  status: blogStatusSchema.optional().default(BLOG_STATUS.DRAFT),
  publishedAt: z.string().datetime().optional().nullable().default(null),
  seoTitle: optionalTextSchema,
  seoDescription: optionalTextSchema,
  canonicalUrl: optionalTextSchema,
  ogImageUrl: optionalTextSchema,
  linkedProductIds: stringIdListSchema.optional().default([]),
  linkedCategoryIds: stringIdListSchema.optional().default([]),
  relatedBlogIds: stringIdListSchema.optional().default([]),
  faqItems: z.array(faqItemSchema).max(30).optional().default([])
});

const updateBlogSchema = z.object({
  title: z.string().trim().min(5).max(220).optional(),
  slug: z.string().trim().min(2).max(220).optional(),
  excerpt: z.string().trim().min(10).max(600).optional(),
  content: z.string().trim().min(20).max(120000).optional(),
  featuredImageUrl: z.string().trim().max(2000).optional(),
  categoryId: z.string().trim().min(2).max(160).optional(),
  tags: z.array(z.string().trim().min(2).max(80)).optional(),
  author: z.string().trim().min(2).max(120).optional(),
  status: blogStatusSchema.optional(),
  publishedAt: z.string().datetime().optional().nullable(),
  seoTitle: z.string().trim().max(220).optional(),
  seoDescription: z.string().trim().max(600).optional(),
  canonicalUrl: z.string().trim().max(2000).optional(),
  ogImageUrl: z.string().trim().max(2000).optional(),
  linkedProductIds: stringIdListSchema.optional(),
  linkedCategoryIds: stringIdListSchema.optional(),
  relatedBlogIds: stringIdListSchema.optional(),
  faqItems: z.array(faqItemSchema).max(30).optional()
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListAdminBlogsQuery(query) {
  return listAdminBlogsQuerySchema.parse(query || {});
}

function parseListPublicBlogsQuery(query) {
  return listPublicBlogsQuerySchema.parse(query || {});
}

function parseCreateBlogPayload(payload) {
  ensureObject(payload, "Create blog");
  return createBlogSchema.parse(payload);
}

function parseUpdateBlogPayload(payload) {
  ensureObject(payload, "Update blog");
  return updateBlogSchema.parse(payload);
}

module.exports = {
  parseListAdminBlogsQuery,
  parseListPublicBlogsQuery,
  parseCreateBlogPayload,
  parseUpdateBlogPayload
};
