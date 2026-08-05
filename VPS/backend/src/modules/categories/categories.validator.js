const { z } = require("zod");
const { HttpError } = require("../../common/http-error");
const { booleanQueryParam } = require("../../common/zod-helpers");

const listAdminCategoriesQuerySchema = z.object({
  includeInactive: booleanQueryParam(true),
  parentCategoryId: z.string().trim().optional(),
  q: z.string().trim().max(120).optional().default("")
});

const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).optional(),
  parentCategoryId: z.string().trim().max(150).optional().nullable(),
  description: z.string().trim().max(500).optional().default(""),
  imageUrl: z.string().trim().max(1000).optional().default(""),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional().default(0)
});

const categoryUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(2).max(120).optional(),
  parentCategoryId: z.string().trim().max(150).optional().nullable(),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional()
});

function ensureObject(payload, label) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, `${label} payload must be an object.`);
  }
}

function parseListAdminCategoriesQuery(query) {
  return listAdminCategoriesQuerySchema.parse(query || {});
}

function parseCreateCategoryPayload(payload) {
  ensureObject(payload, "Create category");
  return categoryCreateSchema.parse(payload);
}

function parseUpdateCategoryPayload(payload) {
  ensureObject(payload, "Update category");
  return categoryUpdateSchema.parse(payload);
}

module.exports = {
  parseListAdminCategoriesQuery,
  parseCreateCategoryPayload,
  parseUpdateCategoryPayload
};
